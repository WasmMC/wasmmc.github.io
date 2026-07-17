#!/usr/bin/env python3
"""Offline tests for LLVM target inventory change detection."""

from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from check_llvm_targets import analyze, parse_cmake_set, write_cmake_cache


inventory = json.loads(
    (ROOT / "regression/llvm-target-inventory.json").read_text(encoding="utf-8")
)
stable = set(inventory["stable"])
experimental = set(inventory["experimental"])

fixture = """
set(LLVM_ALL_TARGETS AArch64 ARM X86)
set(LLVM_ALL_EXPERIMENTAL_TARGETS
  M68k
  Xtensa
)
"""
assert parse_cmake_set(fixture, "LLVM_ALL_TARGETS") == {"AArch64", "ARM", "X86"}
assert parse_cmake_set(fixture, "LLVM_ALL_EXPERIMENTAL_TARGETS") == {"M68k", "Xtensa"}

matching = analyze(inventory, "22.1.8", stable, experimental)
assert matching["ok"]

added = analyze(inventory, "22.1.8", stable | {"NewArch"}, experimental)
assert not added["ok"] and added["changes"]["added_stable"] == ["NewArch"]

promoted = analyze(inventory, "23.1.0", stable | {"M68k"}, experimental - {"M68k"})
assert not promoted["ok"]
assert promoted["changes"]["promoted_to_stable"] == ["M68k"]
assert promoted["changes"]["version_mismatch"]

broken = deepcopy(inventory)
del broken["excluded"]["XCore"]
assert analyze(broken, "22.1.8", stable, experimental)["inventory_errors"]

with tempfile.TemporaryDirectory() as directory:
    output = Path(directory) / "targets.cmake"
    write_cmake_cache(output, matching)
    text = output.read_text(encoding="utf-8")
    assert "M68k;Xtensa" in text
    assert "AMDGPU" not in text

print("LLVM target inventory tests passed")
