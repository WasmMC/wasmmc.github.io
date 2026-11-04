#!/usr/bin/env python3
"""Check that frontend-only changes can reuse exact compiled WASM bundles."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github" / "workflows" / "build.yml").read_text(encoding="utf-8")
emscripten_version = (ROOT / "EMSCRIPTEN_VERSION").read_text(encoding="utf-8").strip()

assert re.fullmatch(r"\d+\.\d+\.\d+", emscripten_version)

required = (
    "id: wasm-binaries",
    "actions/cache@caa296126883cff596d87d8935842f9db880ef25 # v5",
    "emscripten-core/setup-emsdk@4528d102f7230f0e7b276855c01ea1159be0e984 # v16",
    "Read pinned Emscripten version",
    "version: ${{ steps.emscripten.outputs.version }}",
    "emscripten-${{ steps.emscripten.outputs.version }}",
    "wasmmc-bundles-v2-llvm-",
    "hashFiles('LLVM_SHA256', 'CMakeLists.txt', 'src/**', 'scripts/check_llvm_targets.py', 'regression/llvm-target-inventory.json')",
    "build/llvm_backend_mainstream.js",
    "build/llvm_backend_systems.wasm",
    "build/llvm_backend_embedded.wasm",
    "steps.wasm-binaries.outputs.cache-hit != 'true'",
    "scripts/render_backend_manifest.py",
)
for text in required:
    assert text in workflow, f"missing compiled-bundle cache policy: {text}"

cache_block = workflow.split("      - name: Restore compiled WasmMC bundles\n", 1)[1]
cache_block = cache_block.split("\n      - name: Setup Emscripten SDK", 1)[0]
assert "restore-keys" not in cache_block
assert "web/" not in cache_block
assert "README" not in cache_block
assert "licenses/" not in cache_block

for step in (
    "Setup Emscripten SDK",
    "Install dependencies",
    "Cache LLVM source",
    "Cache LLVM WASM objects",
    "Configure WASM bundles",
    "Build WasmMC bundles",
):
    block = workflow.split(f"      - name: {step}\n", 1)[1]
    block = block.split("\n      - name:", 1)[0]
    assert "steps.wasm-binaries.outputs.cache-hit != 'true'" in block

print("Build cache policy tests passed")
