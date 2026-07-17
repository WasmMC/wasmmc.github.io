#!/usr/bin/env python3
"""Check release-manifest rendering on compiled-bundle cache hits."""

from pathlib import Path
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from render_backend_manifest import render


with tempfile.TemporaryDirectory() as temporary:
    output = Path(temporary) / "build" / "llvm_backend_manifest.json"
    document = render(
        ROOT / "llvm_backend_manifest.json.in",
        ROOT / "LLVM_VERSION",
        output,
        "2099",
    )
    assert output.is_file()
    assert document["llvmVersion"] == (ROOT / "LLVM_VERSION").read_text().strip()
    assert document["buildYear"] == "2099"
    assert set(document["bundles"]) == {"mainstream", "systems", "embedded", "full"}

print("Manifest renderer tests passed")
