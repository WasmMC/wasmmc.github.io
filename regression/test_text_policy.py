#!/usr/bin/env python3
"""Enforce small public-facing text policies across repository sources."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {
    ".git", "build", "dist", "full-dist", "native-artifacts",
    "native-build", "native-source", "reports", "__pycache__",
}
TEXT_SUFFIXES = {
    ".cmake", ".cpp", ".h", ".html", ".in", ".js", ".json", ".md",
    ".mjs", ".py", ".tc", ".txt", ".yaml", ".yml",
}
PROHIBITED = {"\u2013": "U+2013 en dash", "\u2014": "U+2014 em dash"}


def source_files():
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in TEXT_SUFFIXES or path.name == "CMakeLists.txt":
            yield path


def main() -> int:
    failures = []
    for path in source_files():
        text = path.read_text(encoding="utf-8")
        for line_number, line in enumerate(text.splitlines(), 1):
            for character, description in PROHIBITED.items():
                if character in line:
                    failures.append(
                        f"{path.relative_to(ROOT)}:{line_number}: prohibited {description}"
                    )
    if failures:
        print("\n".join(failures))
        return 1
    print("Text policy tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
