#!/usr/bin/env python3
"""Check immutable dependencies, least privilege, and LLVM source verification."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
workflows = sorted((ROOT / ".github" / "workflows").glob("*.yml"))
sha256 = (ROOT / "LLVM_SHA256").read_text(encoding="utf-8").strip()

assert re.fullmatch(r"[0-9a-f]{64}", sha256)

for path in workflows:
    text = path.read_text(encoding="utf-8")
    uses = re.findall(r"^\s*uses:\s*([^\s#]+)(?:\s+#\s*(v\d+))?\s*$", text, re.MULTILINE)
    assert uses, f"{path}: no actions found"
    for reference, version_comment in uses:
        owner_repo, separator, revision = reference.rpartition("@")
        assert separator and "/" in owner_repo, f"{path}: malformed action reference {reference}"
        assert re.fullmatch(r"[0-9a-f]{40}", revision), (
            f"{path}: action is not pinned to a full commit SHA: {reference}"
        )
        assert version_comment, f"{path}: pinned action lacks a major-version comment: {reference}"

build = (ROOT / ".github" / "workflows" / "build.yml").read_text(encoding="utf-8")
assert "permissions:\n  contents: read\n" in build
assert "LLVM_SHA256" in build
assert "sha256sum --check --strict" in build
assert "scripts/check_llvm_targets.py" in build.split("key: wasmmc-bundles-v2", 1)[1].split("\n", 1)[0]
assert "hashFiles('LLVM_VERSION', 'LLVM_SHA256', 'scripts/check_llvm_targets.py'" in build

cmake = (ROOT / "CMakeLists.txt").read_text(encoding="utf-8")
assert "URL_HASH SHA256=${LLVM_SOURCE_SHA256}" in cmake

release_workflow = (
    ROOT / ".github" / "workflows" / "check-llvm-release.yml"
).read_text(encoding="utf-8")
assert "--checksum-file LLVM_SHA256" in release_workflow

print("Supply-chain policy tests passed")
