#!/usr/bin/env python3
"""Find the newest stable LLVM release and optionally update LLVM_VERSION."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request


TAG = re.compile(r"^llvmorg-(\d+)\.(\d+)\.(\d+)$")


def parse_version(value: str) -> tuple[int, int, int]:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", value.strip())
    if not match:
        raise ValueError(f"invalid stable LLVM version: {value!r}")
    return tuple(map(int, match.groups()))


def release_documents(repository: str, releases_json: Path | None = None) -> list[dict]:
    if releases_json:
        return json.loads(releases_json.read_text(encoding="utf-8"))
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/releases?per_page=100",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "llvm-wasm-release-checker",
            "X-GitHub-Api-Version": "2022-11-28",
            **(
                {"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"}
                if os.environ.get("GITHUB_TOKEN") else {}
            ),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            releases = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 403 and not os.environ.get("GITHUB_TOKEN"):
            raise RuntimeError(
                "GitHub API rate limit reached; set GITHUB_TOKEN or retry later"
            ) from error
        raise
    return releases


def stable_releases(repository: str, releases_json: Path | None = None) -> list[tuple[int, int, int]]:
    return versions_from_releases(release_documents(repository, releases_json))


def versions_from_releases(releases: list[dict]) -> list[tuple[int, int, int]]:
    versions = []
    for release in releases:
        if release.get("draft") or release.get("prerelease"):
            continue
        match = TAG.fullmatch(release.get("tag_name", ""))
        if match:
            versions.append(tuple(map(int, match.groups())))
    return versions


def source_digest_from_releases(releases: list[dict], version: tuple[int, int, int]) -> str:
    value = ".".join(map(str, version))
    tag = f"llvmorg-{value}"
    asset_name = f"llvm-project-{value}.src.tar.xz"
    for release in releases:
        if release.get("tag_name") != tag:
            continue
        for asset in release.get("assets", []):
            if asset.get("name") != asset_name:
                continue
            digest = asset.get("digest", "")
            if re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
                return digest.removeprefix("sha256:")
            raise ValueError(f"{asset_name} does not have a valid GitHub SHA-256 digest")
        raise ValueError(f"release {tag} does not contain {asset_name}")
    raise ValueError(f"release metadata does not contain {tag}")


def emit_github_output(path: str | None, values: dict[str, str]) -> None:
    if not path:
        return
    with Path(path).open("a", encoding="utf-8") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")


def update_pins(version_file: Path, target_inventory: Path | None,
                version: tuple[int, int, int], checksum_file: Path | None = None,
                checksum: str | None = None) -> None:
    value = ".".join(map(str, version))
    if (checksum_file is None) != (checksum is None):
        raise ValueError("checksum_file and checksum must be provided together")
    if checksum is not None and not re.fullmatch(r"[0-9a-f]{64}", checksum):
        raise ValueError("LLVM source checksum must be a lowercase SHA-256 digest")
    version_file.write_text(value + "\n", encoding="utf-8")
    if checksum_file is not None:
        checksum_file.write_text(checksum + "\n", encoding="utf-8")
    if target_inventory:
        document = json.loads(target_inventory.read_text(encoding="utf-8"))
        if document.get("schema") != 1:
            raise ValueError(f"{target_inventory}: unsupported target inventory schema")
        document["llvm_version"] = value
        target_inventory.write_text(
            json.dumps(document, indent=2) + "\n", encoding="utf-8"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version-file", type=Path, default=Path("LLVM_VERSION"))
    parser.add_argument("--checksum-file", type=Path, default=Path("LLVM_SHA256"))
    parser.add_argument("--repository", default="llvm/llvm-project")
    parser.add_argument("--include-major", action="store_true")
    parser.add_argument("--releases-json", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--target-inventory", type=Path)
    parser.add_argument("--update", action="store_true")
    parser.add_argument("--github-output")
    args = parser.parse_args()

    current = parse_version(args.version_file.read_text(encoding="utf-8"))
    releases = release_documents(args.repository, args.releases_json)
    versions = versions_from_releases(releases)
    eligible = versions if args.include_major else [v for v in versions if v[0] == current[0]]
    if not eligible:
        raise RuntimeError("no eligible stable LLVM releases found")

    latest = max(eligible)
    update_available = latest > current
    if update_available and args.update:
        checksum = source_digest_from_releases(releases, latest)
        update_pins(
            args.version_file, args.target_inventory, latest,
            args.checksum_file, checksum,
        )

    values = {
        "current": ".".join(map(str, current)),
        "latest": ".".join(map(str, latest)),
        "update_available": str(update_available).lower(),
        "major_change": str(latest[0] != current[0]).lower(),
    }
    emit_github_output(args.github_output, values)
    print(json.dumps(values, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2)
