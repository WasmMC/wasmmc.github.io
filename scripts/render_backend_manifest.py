#!/usr/bin/env python3
"""Render the release manifest independently of a CMake configure run."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys


EXPECTED_BUNDLES = {"mainstream", "systems", "embedded", "full"}


def render(template_path: Path, version_path: Path, output_path: Path, year: str) -> dict:
    version = version_path.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("LLVM version must use x.y.z format")
    if not re.fullmatch(r"\d{4}", year):
        raise ValueError("build year must contain four digits")

    text = template_path.read_text(encoding="utf-8")
    text = text.replace("@LLVM_RELEASE_VERSION@", version)
    text = text.replace("@LLVM_BUILD_YEAR@", year)
    if "@LLVM_" in text:
        raise ValueError("manifest template contains an unresolved LLVM placeholder")

    document = json.loads(text)
    if document.get("schema") != 1:
        raise ValueError("manifest must use schema 1")
    if document.get("llvmVersion") != version or document.get("buildYear") != year:
        raise ValueError("manifest metadata does not match its render inputs")
    if set(document.get("bundles", {})) != EXPECTED_BUNDLES:
        raise ValueError("manifest does not contain the expected bundle set")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    return document


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--version-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--year", default=str(datetime.now(timezone.utc).year))
    args = parser.parse_args()
    try:
        render(args.template, args.version_file, args.output, args.year)
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
