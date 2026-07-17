#!/usr/bin/env python3
"""Offline checks for stable LLVM release selection."""

from pathlib import Path
import json
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from check_llvm_release import (
    parse_version, source_digest_from_releases, update_pins, versions_from_releases,
)


assert parse_version("22.1.8\n") == (22, 1, 8)
assert versions_from_releases([
    {"tag_name": "llvmorg-22.1.8", "draft": False, "prerelease": False},
    {"tag_name": "llvmorg-22.1.9-rc1", "draft": False, "prerelease": True},
    {"tag_name": "llvmorg-23.1.0", "draft": False, "prerelease": False},
    {"tag_name": "llvmorg-24.0.0", "draft": True, "prerelease": False},
]) == [(22, 1, 8), (23, 1, 0)]

digest = "a" * 64
releases = [{
    "tag_name": "llvmorg-22.1.9", "draft": False, "prerelease": False,
    "assets": [{
        "name": "llvm-project-22.1.9.src.tar.xz",
        "digest": f"sha256:{digest}",
    }],
}]
assert source_digest_from_releases(releases, (22, 1, 9)) == digest

with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    version_file = directory / "LLVM_VERSION"
    checksum_file = directory / "LLVM_SHA256"
    inventory_file = directory / "inventory.json"
    version_file.write_text("22.1.8\n", encoding="utf-8")
    inventory_file.write_text(
        json.dumps({"schema": 1, "llvm_version": "22.1.8"}), encoding="utf-8"
    )
    update_pins(version_file, inventory_file, (22, 1, 9), checksum_file, digest)
    assert version_file.read_text(encoding="utf-8") == "22.1.9\n"
    assert checksum_file.read_text(encoding="utf-8") == digest + "\n"
    assert json.loads(inventory_file.read_text(encoding="utf-8"))["llvm_version"] == "22.1.9"

print("LLVM release checker tests passed")
