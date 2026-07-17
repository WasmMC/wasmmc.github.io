#!/usr/bin/env python3
"""Validate regression JSON reports and emit a compact Markdown summary."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


TOTAL_KEYS = ("passed", "failed", "skipped", "known_mismatches", "unexpected_passes")


def load_report(path: Path) -> dict:
    report = json.loads(path.read_text(encoding="utf-8"))
    if report.get("schema") != 1:
        raise ValueError(f"{path}: unsupported or missing report schema")
    if report.get("harness_error"):
        raise ValueError(f"{path}: harness error: {report['harness_error']}")
    totals = report.get("totals", {})
    if any(not isinstance(totals.get(key), int) for key in TOTAL_KEYS):
        raise ValueError(f"{path}: invalid totals")
    if sum(totals[key] for key in TOTAL_KEYS) != report.get("selected_cases"):
        raise ValueError(f"{path}: totals do not equal selected_cases")
    if len(report.get("cases", [])) != report.get("selected_cases"):
        raise ValueError(f"{path}: case record count does not equal selected_cases")
    return report


def markdown(reports: list[tuple[Path, dict]]) -> str:
    lines = [
        "# WasmMC regression results", "",
        "| Suite | Bundle | Passed | Failed | Skipped | Known | XPASS | Seconds | WASM MiB |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for _, report in reports:
        totals = report["totals"]
        wasm_bytes = report.get("backend", {}).get("wasm", {}).get("bytes", 0)
        lines.append(
            f"| {report.get('suite', 'regression')} | {report['bundle']} | "
            f"{totals['passed']} | {totals['failed']} | {totals['skipped']} | "
            f"{totals['known_mismatches']} | {totals['unexpected_passes']} | "
            f"{report.get('duration_seconds', 0):.2f} | {wasm_bytes / 1048576:.2f} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--markdown", type=Path)
    args = parser.parse_args()

    try:
        reports = [(path, load_report(path)) for path in args.reports]
        failures = []
        for path, report in reports:
            totals = report["totals"]
            if totals["failed"] or totals["unexpected_passes"]:
                failures.append(str(path))

        regression = {
            report["bundle"]: report for _, report in reports
            if report.get("suite", "regression") == "regression"
        }
        if "full" in regression and all(name in regression for name in ("mainstream", "systems", "embedded")):
            split_count = sum(
                regression[name]["selected_cases"]
                for name in ("mainstream", "systems", "embedded")
            )
            if split_count != regression["full"]["selected_cases"]:
                raise ValueError(
                    f"split coverage {split_count} does not equal full coverage "
                    f"{regression['full']['selected_cases']}"
                )

        output = markdown(reports)
        print(output)
        if args.markdown:
            args.markdown.parent.mkdir(parents=True, exist_ok=True)
            args.markdown.write_text(output, encoding="utf-8")
        return 1 if failures else 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
