#!/usr/bin/env python3
"""Keep WasmMC runners on reviewed, explicit Ubuntu images."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
build = (ROOT / ".github" / "workflows" / "build.yml").read_text(encoding="utf-8")
release = (
    ROOT / ".github" / "workflows" / "check-llvm-release.yml"
).read_text(encoding="utf-8")

assert "ubuntu-latest" not in build
assert "ubuntu-latest" not in release
assert build.count("runs-on: ubuntu-24.04-arm") == 1
assert build.count("runs-on: ubuntu-24.04\n") == 3
assert release.count("runs-on: ubuntu-24.04\n") == 1

print("Runner policy tests passed")
