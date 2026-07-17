#!/usr/bin/env python3
"""Create deterministic deployable and optional-full WasmMC artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys


SPLIT_BUNDLES = ("mainstream", "systems", "embedded")
WEB_ASSETS = ("app.js", "backend-manager.js", "backend-worker.js", "favicon.svg")
LEGAL_FILES = ("LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md")
LEGAL_LICENSES = ("LLVM.txt", "EMSCRIPTEN.txt", "MUSL.txt")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fingerprinted_name(name: str, fingerprint: str) -> str:
    path = Path(name)
    return f"{path.stem}.{fingerprint[:16]}{path.suffix}"


def reset_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def write_checksums(directory: Path) -> None:
    entries = []
    for path in sorted(directory.rglob("*"), key=lambda item: item.relative_to(directory).as_posix()):
        if path.is_file() and path.name != "SHA256SUMS":
            relative = path.relative_to(directory).as_posix()
            entries.append(f"{digest(path.read_bytes())}  {relative}")
    (directory / "SHA256SUMS").write_text("\n".join(entries) + "\n", encoding="utf-8")


def require_file(path: Path) -> Path:
    if not path.is_file() or not path.stat().st_size:
        raise ValueError(f"missing or empty required file: {path}")
    return path


def stage_legal_files(legal_dir: Path, output_dir: Path) -> None:
    for name in LEGAL_FILES:
        source = require_file(legal_dir / name)
        shutil.copyfile(source, output_dir / name)
    output_licenses = output_dir / "licenses"
    output_licenses.mkdir()
    for name in LEGAL_LICENSES:
        source = require_file(legal_dir / "licenses" / name)
        shutil.copyfile(source, output_licenses / name)


def stage_site(web_dir: Path, build_dir: Path, site_dir: Path, legal_dir: Path) -> dict:
    source_manifest_path = require_file(build_dir / "llvm_backend_manifest.json")
    source_manifest = json.loads(source_manifest_path.read_text(encoding="utf-8"))
    source_bundles = source_manifest.get("bundles", {})
    if any(name not in source_bundles for name in (*SPLIT_BUNDLES, "full")):
        raise ValueError("build manifest does not contain every expected bundle")

    reset_directory(site_dir)

    frontend_names = {}
    for name in WEB_ASSETS:
        data = require_file(web_dir / name).read_bytes()
        output_name = fingerprinted_name(name, digest(data))
        write_bytes(site_dir / output_name, data)
        frontend_names[name] = output_name

    deploy_manifest = {
        "schema": source_manifest.get("schema", 1),
        "llvmVersion": source_manifest["llvmVersion"],
        "buildYear": source_manifest["buildYear"],
        "bundles": {},
    }
    if not deploy_manifest["buildYear"]:
        raise ValueError("build manifest does not contain a build year")

    for name in SPLIT_BUNDLES:
        source_spec = source_bundles[name]
        js_data = require_file(build_dir / source_spec["js"]).read_bytes()
        wasm_data = require_file(build_dir / source_spec["wasm"]).read_bytes()
        pair_fingerprint = digest(js_data + b"\0" + wasm_data)
        js_name = fingerprinted_name(source_spec["js"], pair_fingerprint)
        wasm_name = fingerprinted_name(source_spec["wasm"], pair_fingerprint)
        write_bytes(site_dir / js_name, js_data)
        write_bytes(site_dir / wasm_name, wasm_data)
        deploy_manifest["bundles"][name] = {
            **source_spec,
            "js": js_name,
            "wasm": wasm_name,
        }

    manifest_data = (json.dumps(deploy_manifest, indent=2) + "\n").encode()
    manifest_name = fingerprinted_name("llvm_backend_manifest.json", digest(manifest_data))
    write_bytes(site_dir / manifest_name, manifest_data)

    config_data = (
        "window.WASMMC_ASSETS = Object.freeze(" +
        json.dumps({
            "manifestUrl": manifest_name,
            "workerUrl": frontend_names["backend-worker.js"],
        }, separators=(",", ":")) +
        ");\n"
    ).encode()
    config_name = fingerprinted_name("site-config.js", digest(config_data))
    write_bytes(site_dir / config_name, config_data)

    index = require_file(web_dir / "index.html").read_text(encoding="utf-8")
    old_favicon = '<link rel="icon" href="favicon.svg" type="image/svg+xml">'
    new_favicon = (
        f'<link rel="icon" href="{frontend_names["favicon.svg"]}" '
        'type="image/svg+xml">'
    )
    if index.count(old_favicon) != 1:
        raise ValueError("web/index.html does not contain the expected favicon link")
    index = index.replace(old_favicon, new_favicon)
    old_scripts = '<script src="backend-manager.js"></script>\n<script src="app.js"></script>'
    new_scripts = (
        f'<script src="{config_name}"></script>\n'
        f'<script src="{frontend_names["backend-manager.js"]}"></script>\n'
        f'<script src="{frontend_names["app.js"]}"></script>'
    )
    if index.count(old_scripts) != 1:
        raise ValueError("web/index.html does not contain the expected script block")
    (site_dir / "index.html").write_text(index.replace(old_scripts, new_scripts), encoding="utf-8")
    (site_dir / ".nojekyll").write_text("", encoding="utf-8")
    stage_legal_files(legal_dir, site_dir)
    write_checksums(site_dir)

    return {
        "manifest": manifest_name,
        "config": config_name,
        "frontend": frontend_names,
        "bundles": deploy_manifest["bundles"],
    }


def stage_full_bundle(build_dir: Path, full_dir: Path, legal_dir: Path) -> dict:
    source_manifest = json.loads(
        require_file(build_dir / "llvm_backend_manifest.json").read_text(encoding="utf-8")
    )
    full_spec = source_manifest["bundles"]["full"]
    reset_directory(full_dir)
    for field in ("js", "wasm"):
        source = require_file(build_dir / full_spec[field])
        shutil.copyfile(source, full_dir / source.name)
    full_manifest = {
        "schema": source_manifest.get("schema", 1),
        "llvmVersion": source_manifest["llvmVersion"],
        "buildYear": source_manifest["buildYear"],
        "bundles": {"full": full_spec},
    }
    (full_dir / "llvm_backend_manifest.json").write_text(
        json.dumps(full_manifest, indent=2) + "\n", encoding="utf-8"
    )
    (full_dir / "README.md").write_text(
        "# Optional full WasmMC backend\n\n"
        "This compatibility artifact contains every WasmMC target family in one "
        "Emscripten module. The website uses the smaller split bundles instead.\n\n"
        "Load `llvm_backend.js`, call `LLVMEngine()`, and keep "
        "`llvm_backend.wasm` in the same directory. Licensing and third-party "
        "notices are included with this artifact.\n",
        encoding="utf-8",
    )
    stage_legal_files(legal_dir, full_dir)
    write_checksums(full_dir)
    return full_manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--web-dir", type=Path, default=Path("web"))
    parser.add_argument("--build-dir", type=Path, default=Path("build"))
    parser.add_argument("--site-dir", type=Path, default=Path("dist"))
    parser.add_argument("--full-dir", type=Path, default=Path("full-dist"))
    parser.add_argument("--legal-dir", type=Path, default=Path("."))
    args = parser.parse_args()

    try:
        summary = stage_site(args.web_dir, args.build_dir, args.site_dir, args.legal_dir)
        stage_full_bundle(args.build_dir, args.full_dir, args.legal_dir)
        print(json.dumps(summary, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
