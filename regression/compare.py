#!/usr/bin/env python3
"""Compare native llvm-mc with a persistent WebAssembly backend."""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

# Keep the source-only regression directory clean when the script is run.
sys.dont_write_bytecode = True

from llvm_runner import run_native
from testcase_parser import TestCase, discover


HERE = Path(__file__).resolve().parent
BUNDLES = ("full", "mainstream", "systems", "embedded")


class WasmRunner:
    def __init__(self, node: str, runner: Path, backend_js: Path):
        self.process = subprocess.Popen(
            [node, str(runner), str(backend_js)], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
        )

    def run(self, case: TestCase) -> dict:
        assert self.process.stdin is not None and self.process.stdout is not None
        request = {
            "operation": case.operation, "triple": case.triple, "cpu": case.cpu,
            "features": case.features, "intel_syntax": case.intel_syntax,
            "relax": case.relax, "printer_options": case.printer_options,
        }
        request["source" if case.operation == "assemble" else "bytes"] = (
            case.body if case.operation == "assemble" else bytes.fromhex(case.body).hex()
        )
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            assert self.process.stderr is not None
            raise RuntimeError(
                f"WASM runner exited unexpectedly: {self.process.stderr.read()}"
            )
        result = json.loads(line)
        if "protocol_error" in result:
            raise RuntimeError(result["protocol_error"])
        return result

    def close(self) -> None:
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            self.process.wait(timeout=5)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


def differences(case: TestCase, native: dict, wasm: dict) -> list[str]:
    expected_success = case.expect == "success"
    failures = []
    for label, result in (("native", native), ("wasm", wasm)):
        if result["success"] != expected_success:
            failures.append(f"{label} success={result['success']}, expected {expected_success}")
        if result["illegal"] != (case.expect == "illegal"):
            failures.append(
                f"{label} illegal={result['illegal']}, expected {case.expect == 'illegal'}"
            )
    if native["success"] != wasm["success"]:
        failures.append(f"success differs: native={native['success']} wasm={wasm['success']}")
    if native["illegal"] != wasm["illegal"]:
        failures.append(
            f"illegal behavior differs: native={native['illegal']} wasm={wasm['illegal']}"
        )
    if case.operation == "assemble" and native["success"] and wasm["success"]:
        if native["bytes"] != wasm["bytes"]:
            failures.append(f"bytes differ: native={native['bytes']} wasm={wasm['bytes']}")
    if case.operation == "disassemble" and native["success"] and wasm["success"]:
        if native["disassembly"] != wasm["disassembly"]:
            failures.append(
                f"disassembly differs: native={native['disassembly']!r} "
                f"wasm={wasm['disassembly']!r}"
            )
    return failures


def bundle_for_triple(triple: str) -> str:
    arch = triple.lower().split("-", 1)[0]
    if arch.startswith(("x86_64", "i386", "i486", "i586", "i686", "arm", "thumb", "aarch64")):
        return "mainstream"
    if arch.startswith((
        "riscv", "mips", "powerpc", "ppc", "sparc", "wasm", "bpf",
        "loongarch", "s390",
    )):
        return "systems"
    if arch.startswith(("avr", "msp430", "m68k", "xtensa", "hexagon")):
        return "embedded"
    raise ValueError(f"no split-bundle mapping for target triple {triple!r}")


def select_cases(cases: list[TestCase], bundle: str) -> list[TestCase]:
    # Validate every triple even for a full run so a new family cannot bypass
    # split-bundle CI merely because nobody updated this mapping.
    mapped = [(case, bundle_for_triple(case.triple)) for case in cases]
    return [case for case, owner in mapped if bundle == "full" or owner == bundle]


def load_known_differences(path: Path | None) -> dict[str, dict]:
    if path is None:
        return {}
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("schema") != 1 or not isinstance(document.get("cases"), list):
        raise ValueError(f"{path}: expected schema 1 with a cases array")
    result = {}
    for entry in document["cases"]:
        name = entry.get("name")
        if not name or name in result:
            raise ValueError(f"{path}: known-difference names must be unique and nonempty")
        expected = entry.get("expected_differences")
        if not isinstance(expected, list) or not expected or not all(
            isinstance(item, str) and item for item in expected
        ):
            raise ValueError(
                f"{path}: known difference {name!r} must define expected_differences"
            )
        result[name] = entry
    return result


def matches_known_difference(entry: dict, problems: list[str]) -> bool:
    return problems == entry["expected_differences"]


def file_metadata(path: Path) -> dict:
    resolved = path.resolve()
    data = resolved.read_bytes()
    return {
        "path": str(resolved),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def llvm_version(executable: str) -> str:
    result = subprocess.run(
        [executable, "--version"], text=True, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"failed to query {executable} --version: {result.stdout.strip()}")
    return result.stdout.splitlines()[0].strip()


def public_backend_result(result: dict) -> dict:
    return {
        "success": result["success"],
        "illegal": result["illegal"],
        "bytes": result.get("bytes", ""),
        "disassembly": result.get("disassembly", []),
        "diagnostics": result.get("stderr", ""),
    }


def write_report(path: Path | None, report: dict) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def initial_report(args: argparse.Namespace, selected: int) -> dict:
    backend = file_metadata(args.backend_js)
    wasm_path = args.backend_js.with_suffix(".wasm")
    if wasm_path.exists():
        backend["wasm"] = file_metadata(wasm_path)
    return {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "suite": args.suite_name,
        "bundle": args.bundle,
        "llvm": {"executable": args.llvm_mc, "version": llvm_version(args.llvm_mc)},
        "backend": backend,
        "selected_cases": selected,
        "duration_seconds": 0.0,
        "totals": {
            "passed": 0, "failed": 0, "skipped": 0,
            "known_mismatches": 0, "unexpected_passes": 0,
        },
        "cases": [],
        "harness_error": None,
    }


def case_record(case: TestCase, native: dict, wasm: dict, problems: list[str],
                status: str, duration: float, known: dict | None = None) -> dict:
    metadata = asdict(case)
    metadata.pop("body")
    return {
        "name": case.name,
        "source": {"file": case.source_file, "line": case.source_line},
        "operation": case.operation,
        "triple": case.triple,
        "cpu": case.cpu,
        "features": case.features,
        "expect": case.expect,
        "status": status,
        "duration_seconds": round(duration, 6),
        "differences": problems,
        "known_difference": known,
        "native": public_backend_result(native),
        "wasm": public_backend_result(wasm),
        "metadata": metadata,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", default=[str(HERE / "testcases")])
    parser.add_argument("--llvm-mc", default="/usr/bin/llvm-mc-22")
    parser.add_argument("--node", default="node")
    parser.add_argument("--wasm-runner", type=Path, default=HERE / "wasm_runner.mjs")
    parser.add_argument(
        "--backend-js", type=Path, default=HERE.parent / "llvm_backend.js",
        help="Emscripten JS bundle to test",
    )
    parser.add_argument("--bundle", choices=BUNDLES, default="full")
    parser.add_argument("--suite-name", default="regression")
    parser.add_argument("--json-report", type=Path)
    parser.add_argument("--known-differences", type=Path)
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--quiet", "-q", action="store_true", help="only print failures and summary")
    args = parser.parse_args()

    started = time.perf_counter()
    report = None
    try:
        cases = select_cases(discover(args.paths), args.bundle)
        if not cases:
            raise ValueError(f"no testcases selected for bundle {args.bundle}")
        known_differences = load_known_differences(args.known_differences)
        report = initial_report(args, len(cases))

        with WasmRunner(args.node, args.wasm_runner, args.backend_js) as wasm_runner:
            for case in cases:
                case_started = time.perf_counter()
                native = run_native(case, args.llvm_mc)
                wasm = wasm_runner.run(case)
                unavailable = wasm.get("raw", "").startswith("ERROR: Target lookup failed:")
                problems: list[str]
                status: str

                if case.wasm_target == "optional" and unavailable:
                    expected_success = case.expect == "success"
                    problems = []
                    if native["success"] != expected_success:
                        problems.append(
                            f"native success={native['success']}, expected {expected_success}"
                        )
                    if native["illegal"] != (case.expect == "illegal"):
                        problems.append(
                            f"native illegal={native['illegal']}, "
                            f"expected {case.expect == 'illegal'}"
                        )
                    status = "failed" if problems else "skipped"
                else:
                    problems = differences(case, native, wasm)
                    if problems and case.name in known_differences:
                        if matches_known_difference(known_differences[case.name], problems):
                            status = "known_mismatch"
                        else:
                            status = "failed"
                            problems.append(
                                "known-difference signature changed; review the allowlist"
                            )
                    elif problems:
                        status = "failed"
                    elif case.name in known_differences:
                        status = "unexpected_pass"
                        problems = ["known mismatch no longer reproduces; review allowlist"]
                    else:
                        status = "passed"

                total_key = {
                    "passed": "passed", "failed": "failed", "skipped": "skipped",
                    "known_mismatch": "known_mismatches",
                    "unexpected_pass": "unexpected_passes",
                }[status]
                report["totals"][total_key] += 1
                record = case_record(
                    case, native, wasm, problems, status,
                    time.perf_counter() - case_started,
                    known_differences.get(case.name),
                )
                report["cases"].append(record)

                label = {
                    "passed": "PASS", "failed": "FAIL", "skipped": "SKIP",
                    "known_mismatch": "KNOWN", "unexpected_pass": "XPASS",
                }[status]
                visible = status not in {"passed", "skipped"} or not args.quiet
                if visible:
                    print(f"{label} {case.name}")
                if problems and status != "known_mismatch":
                    for problem in problems:
                        print(f"  {problem}")
                    if native.get("stderr", "").strip():
                        print(f"  native stderr: {native['stderr'].strip()}")
                    if wasm.get("stderr", "").strip():
                        print(f"  wasm stderr: {wasm['stderr'].strip()}")
                elif status == "known_mismatch" and not args.quiet:
                    print(f"  {known_differences[case.name].get('reason', 'documented mismatch')}")
                elif args.verbose and status == "passed":
                    value = native["bytes"] if case.operation == "assemble" else native["disassembly"]
                    print(f"  {value}")

        report["duration_seconds"] = round(time.perf_counter() - started, 6)
        totals = report["totals"]
        print(
            f"\n{totals['passed']} passed, {totals['failed']} failed, "
            f"{totals['skipped']} skipped, {totals['known_mismatches']} known, "
            f"{totals['unexpected_passes']} unexpected passes"
        )
        write_report(args.json_report, report)
        return 1 if totals["failed"] or totals["unexpected_passes"] else 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        if report is None:
            report = {
                "schema": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
                "suite": args.suite_name, "bundle": args.bundle, "cases": [], "totals": {},
            }
        report["duration_seconds"] = round(time.perf_counter() - started, 6)
        report["harness_error"] = str(exc)
        write_report(args.json_report, report)
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
