"""Parser for WasmMC's small, dependency-free regression format."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class TestCase:
    name: str
    operation: str
    triple: str
    body: str
    cpu: str = ""
    features: str = ""
    intel_syntax: bool = False
    relax: bool = False
    printer_options: str = ""
    expect: str = "success"
    wasm_target: str = "required"
    source_file: str = ""
    source_line: int = 0


_BOOLS = {"true": True, "false": False, "yes": True, "no": False, "1": True, "0": False}
_KEYS = {
    "operation", "triple", "cpu", "features", "intel_syntax", "relax",
    "expect", "split", "wasm_target", "printer_options",
}


def _boolean(value: str, path: Path, line: int) -> bool:
    try:
        return _BOOLS[value.lower()]
    except KeyError as exc:
        raise ValueError(f"{path}:{line}: expected a boolean, got {value!r}") from exc


def parse_file(path: str | Path) -> list[TestCase]:
    path = Path(path)
    lines = path.read_text(encoding="utf-8").splitlines()
    cases: list[TestCase] = []
    i = 0
    while i < len(lines):
        raw = lines[i]
        i += 1
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if not raw.startswith("=== "):
            raise ValueError(f"{path}:{i}: expected '=== <test name>'")
        name = raw[4:].strip()
        start_line = i
        values: dict[str, str] = {}
        while i < len(lines) and lines[i].strip() != "---":
            raw = lines[i]
            i += 1
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            if "=" not in raw:
                raise ValueError(f"{path}:{i}: expected 'key = value' or '---'")
            key, value = (part.strip() for part in raw.split("=", 1))
            if key not in _KEYS:
                raise ValueError(f"{path}:{i}: unknown key {key!r}")
            if key in values:
                raise ValueError(f"{path}:{i}: duplicate key {key!r}")
            values[key] = value
        if i == len(lines):
            raise ValueError(f"{path}:{start_line}: missing '---' before test body")
        i += 1
        body_start = i + 1
        body: list[str] = []
        body_lines: list[int] = []
        while i < len(lines) and not lines[i].startswith("=== "):
            body.append(lines[i])
            body_lines.append(i + 1)
            i += 1
        while body and body[-1] == "":
            body.pop()
            body_lines.pop()

        missing = {"operation", "triple"} - values.keys()
        if missing:
            raise ValueError(f"{path}:{start_line}: missing {', '.join(sorted(missing))}")
        operation = values["operation"]
        if operation not in {"assemble", "disassemble"}:
            raise ValueError(f"{path}:{start_line}: invalid operation {operation!r}")
        if operation != "disassemble" and values.get("printer_options", ""):
            raise ValueError(
                f"{path}:{start_line}: printer_options is only valid for disassembly"
            )
        expect = values.get("expect", "success")
        if expect not in {"success", "illegal"}:
            raise ValueError(f"{path}:{start_line}: invalid expect value {expect!r}")
        wasm_target = values.get("wasm_target", "required")
        if wasm_target not in {"required", "optional"}:
            raise ValueError(
                f"{path}:{start_line}: wasm_target must be 'required' or 'optional'"
            )
        common = dict(
            name=name,
            operation=operation,
            triple=values["triple"],
            cpu=values.get("cpu", ""),
            features=values.get("features", ""),
            intel_syntax=_boolean(values.get("intel_syntax", "false"), path, start_line),
            relax=_boolean(values.get("relax", "false"), path, start_line),
            printer_options=values.get("printer_options", ""),
            expect=expect,
            wasm_target=wasm_target,
            source_file=str(path),
        )
        split = values.get("split", "none")
        if split not in {"none", "lines"}:
            raise ValueError(f"{path}:{start_line}: split must be 'none' or 'lines'")
        if split == "lines":
            entries = [(line, number) for line, number in zip(body, body_lines) if line.strip()]
            if not entries:
                raise ValueError(f"{path}:{body_start}: split case has no nonblank body lines")
            width = len(str(len(entries)))
            for number, (line, source_line) in enumerate(entries, 1):
                cases.append(TestCase(**(common | {
                    "name": f"{name} [{number:0{width}d}]",
                    "body": line,
                    "source_line": source_line,
                })))
        else:
            cases.append(TestCase(**common, body="\n".join(body), source_line=body_start))
    return cases


def discover(paths: list[str]) -> list[TestCase]:
    files: list[Path] = []
    for item in paths:
        path = Path(item)
        files.extend(sorted(path.glob("*.tc")) if path.is_dir() else [path])
    return [case for path in files for case in parse_file(path)]
