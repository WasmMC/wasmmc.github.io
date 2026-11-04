#!/usr/bin/env python3
"""Check fingerprinted website staging and full-bundle separation."""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from stage_site import SPLIT_BUNDLES, digest, stage_full_bundle, stage_site


def verify_checksums(directory: Path) -> None:
    lines = (directory / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    recorded = {}
    for line in lines:
        checksum, relative = line.split("  ", 1)
        recorded[relative] = checksum
        assert digest((directory / relative).read_bytes()) == checksum
    expected = {
        path.relative_to(directory).as_posix()
        for path in directory.rglob("*")
        if path.is_file() and path.name != "SHA256SUMS"
    }
    assert set(recorded) == expected


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    web = base / "web"
    build = base / "build"
    site = base / "site"
    full = base / "full"
    web.mkdir()
    build.mkdir()

    for name in (
        "index.html", "app.js", "byte-input.js", "backend-manager.js",
        "backend-worker.js", "favicon.svg",
    ):
        shutil.copyfile(ROOT / "web" / name, web / name)
    (web / "dummy 11th.txt").write_text("must not ship", encoding="utf-8")

    bundles = {}
    definitions = {
        "mainstream": "LLVMEngineMainstream",
        "systems": "LLVMEngineSystems",
        "embedded": "LLVMEngineEmbedded",
        "full": "LLVMEngine",
    }
    for name, factory in definitions.items():
        stem = "llvm_backend" if name == "full" else f"llvm_backend_{name}"
        js = f"{stem}.js"
        wasm = f"{stem}.wasm"
        (build / js).write_text(f"factory:{factory}\n", encoding="utf-8")
        (build / wasm).write_bytes(("wasm:" + name).encode())
        bundles[name] = {
            "js": js,
            "wasm": wasm,
            "factory": factory,
            "families": [name],
        }
    (build / "llvm_backend_manifest.json").write_text(
        json.dumps({
            "schema": 1,
            "llvmVersion": "22.1.8",
            "buildYear": "2026",
            "bundles": bundles,
        }),
        encoding="utf-8",
    )

    summary = stage_site(web, build, site, ROOT)
    stage_full_bundle(build, full, ROOT)

    assert not (site / "dummy 11th.txt").exists()
    assert not (site / "llvm_backend.js").exists()
    assert set(summary["bundles"]) == set(SPLIT_BUNDLES)
    assert (site / summary["manifest"]).is_file()
    assert (site / summary["config"]).is_file()
    assert (site / ".nojekyll").is_file()
    assert (site / "SHA256SUMS").is_file()
    assert (site / "LICENSE").is_file()
    assert (site / "NOTICE").is_file()
    assert (site / "THIRD_PARTY_NOTICES.md").is_file()
    assert (site / "licenses" / "LLVM.txt").is_file()
    assert (site / "licenses" / "EMSCRIPTEN.txt").is_file()
    assert (site / "licenses" / "MUSL.txt").is_file()

    deploy_manifest = json.loads((site / summary["manifest"]).read_text(encoding="utf-8"))
    assert set(deploy_manifest["bundles"]) == set(SPLIT_BUNDLES)
    assert deploy_manifest["llvmVersion"] == "22.1.8"
    assert deploy_manifest["buildYear"] == "2026"

    index = (site / "index.html").read_text(encoding="utf-8")
    assert summary["config"] in index
    assert summary["frontend"]["app.js"] in index
    assert summary["frontend"]["byte-input.js"] in index
    assert summary["frontend"]["backend-manager.js"] in index
    assert summary["frontend"]["favicon.svg"] in index
    assert (site / summary["frontend"]["favicon.svg"]).is_file()
    assert '<script src="app.js">' not in index
    assert '<script src="byte-input.js">' not in index
    assert '<script src="backend-manager.js">' not in index
    assert 'href="favicon.svg"' not in index
    assert 'href="THIRD_PARTY_NOTICES.md"' in index
    assert 'href="https://github.com/WasmMC/wasmmc.github.io"' in index
    assert 'aria-label="WasmMC source code on GitHub"' in index
    assert 'title="Auto (dis)assemble"' in index

    app = (site / summary["frontend"]["app.js"]).read_text(encoding="utf-8")
    assert "function assemblyPlaceholder" in app
    assert "MiB memory" in app
    assert "PANEL_ARROW_ICON" not in app
    assert "initTitle || 'Bytes'" not in app
    assert "initTitle || 'Instructions'" not in app
    assert "c.value===''?'Default':c.label" in app
    for cpu in ("generic-la32", "generic-la64", "la464", "la664", "z17", "msp430x"):
        assert f"value:'{cpu}'" in app
    for feature in ("+lsx", "+lasx", "+vector-enhancements-3", "+hwmultf5"):
        assert f"flag:'{feature}'" in app

    for spec in summary["bundles"].values():
        assert (site / spec["js"]).is_file()
        assert (site / spec["wasm"]).is_file()
        assert Path(spec["js"]).stem.rsplit(".", 1)[1] == Path(spec["wasm"]).stem.rsplit(".", 1)[1]

    assert (full / "llvm_backend.js").is_file()
    assert (full / "llvm_backend.wasm").is_file()
    assert (full / "SHA256SUMS").is_file()
    assert (full / "LICENSE").is_file()
    assert (full / "NOTICE").is_file()
    assert (full / "THIRD_PARTY_NOTICES.md").is_file()
    full_manifest = json.loads((full / "llvm_backend_manifest.json").read_text(encoding="utf-8"))
    assert set(full_manifest["bundles"]) == {"full"}
    assert not any((full / bundles[name]["js"]).exists() for name in SPLIT_BUNDLES)
    verify_checksums(site)
    verify_checksums(full)

print("Site staging tests passed")
