#!/usr/bin/env python3
"""Resolve a staged bundle asset from WasmMC's fingerprinted manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


def find_manifest(site: Path) -> Path:
    matches = sorted(site.glob("llvm_backend_manifest.*.json"))
    if len(matches) != 1:
        raise ValueError(f"expected one fingerprinted manifest in {site}, found {len(matches)}")
    return matches[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("site", type=Path)
    parser.add_argument("bundle", choices=("mainstream", "systems", "embedded"))
    parser.add_argument("field", choices=("js", "wasm"))
    args = parser.parse_args()

    try:
        document = json.loads(find_manifest(args.site).read_text(encoding="utf-8"))
        name = document["bundles"][args.bundle][args.field]
        path = args.site / name
        if not path.is_file():
            raise ValueError(f"manifest asset is missing: {path}")
        print(path)
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
