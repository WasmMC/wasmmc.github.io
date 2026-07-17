#!/usr/bin/env python3
"""Dependency-free checks for bundle ownership and report policy."""

import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from compare import (
    bundle_for_triple, load_known_differences, matches_known_difference, select_cases,
)
from testcase_parser import discover


expected = {
    "x86_64-unknown-linux-gnu": "mainstream",
    "thumbv7-unknown-linux-gnueabihf": "mainstream",
    "aarch64-unknown-linux-gnu": "mainstream",
    "riscv64-unknown-elf": "systems",
    "mips64el-unknown-linux-gnu": "systems",
    "powerpc64le-unknown-linux-gnu": "systems",
    "wasm32-unknown-unknown": "systems",
    "s390x-unknown-linux-gnu": "systems",
    "avr-unknown-unknown": "embedded",
    "m68k-unknown-linux-gnu": "embedded",
    "hexagon-unknown-linux-musl": "embedded",
}
for triple, bundle in expected.items():
    assert bundle_for_triple(triple) == bundle

cases = discover([str(HERE / "testcases")])
selected = {bundle: select_cases(cases, bundle) for bundle in ("mainstream", "systems", "embedded")}
assert len(cases) == sum(map(len, selected.values()))
assert all(selected.values())
assert len(cases) == 1539
assert {bundle: len(items) for bundle, items in selected.items()} == {
    "mainstream": 547,
    "systems": 697,
    "embedded": 295,
}

known = load_known_differences(HERE / "known_differences.json")
assert "ARM NEON rejected at baseline" in known
neon = known["ARM NEON rejected at baseline"]
for signature in neon["expected_signatures"]:
    assert matches_known_difference(neon, signature["differences"])
assert not matches_known_difference(
    neon, neon["expected_signatures"][0]["differences"] + ["new regression"]
)

report_schema = json.loads((HERE / "report-schema.json").read_text(encoding="utf-8"))
assert report_schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
assert {
    "schema", "generated_at", "suite", "bundle", "llvm", "backend",
    "selected_cases", "duration_seconds", "totals", "cases", "harness_error",
} <= set(report_schema["required"])

print("Reporting policy tests passed")
