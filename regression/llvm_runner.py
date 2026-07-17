"""Native llvm-mc adapter used by compare.py."""

from __future__ import annotations

import re
import subprocess
from dataclasses import asdict
from typing import Any

from testcase_parser import TestCase


_COMMENT = r"(?:#|//|@|;|!)"
_ENCODING = re.compile(rf"{_COMMENT} encoding: \[([^]]*)\]")


def _command(case: TestCase, llvm_mc: str) -> list[str]:
    command = [llvm_mc, f"-triple={case.triple}", "-show-encoding"]
    if case.cpu:
        command.append(f"-mcpu={case.cpu}")
    if case.features:
        command.append(f"-mattr={case.features}")
    if case.relax:
        command.append("-mc-relax-all")
    if case.triple.lower().startswith(("x86_64", "i386", "i486", "i586", "i686")):
        command.append(f"-x86-asm-syntax={'intel' if case.intel_syntax else 'att'}")
        if case.intel_syntax and case.operation == "disassemble":
            command.append("-output-asm-variant=1")
    if case.operation == "disassemble":
        command.append("-disassemble")
        for option in case.printer_options.split(","):
            if option := option.strip():
                command.extend(["-M", option])
    return command


def _normalize_instruction(text: str) -> str:
    return " ".join(text.strip().split())


def _parse_encodings(groups: list[str]) -> bytes:
    output = bytearray()
    for group in groups:
        for token in group.split(","):
            token = token.strip()
            match = re.fullmatch(r"0x([0-9a-fA-F]{2})", token)
            if match:
                output.append(int(match.group(1), 16))
            elif re.fullmatch(r"[A-Z]", token):
                # llvm-mc uses letter placeholders for bytes populated by a
                # fixup. In a relocatable object those bytes are initially 0.
                output.append(0)
    return bytes(output)


def run_native(case: TestCase, llvm_mc: str = "/usr/bin/llvm-mc-22") -> dict[str, Any]:
    if case.operation == "disassemble":
        try:
            raw = bytes.fromhex(case.body)
        except ValueError as exc:
            raise ValueError(f"{case.source_file}:{case.source_line}: invalid hex byte body") from exc
        stdin = " ".join(f"0x{byte:02x}" for byte in raw) + "\n"
    else:
        stdin = case.body + "\n"

    proc = subprocess.run(
        _command(case, llvm_mc), input=stdin, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    encodings = _ENCODING.findall(proc.stdout)
    output_bytes = _parse_encodings(encodings)
    if case.operation == "disassemble" and case.triple.lower().startswith("hexagon"):
        instructions = [
            _normalize_instruction(cleaned)
            for raw_line in proc.stdout.splitlines()
            if (cleaned := re.split(
                rf"{_COMMENT} encoding:", raw_line, maxsplit=1
            )[0].strip()) and cleaned not in {"{", "}"}
        ]
    else:
        instructions = [
            _normalize_instruction(re.split(rf"{_COMMENT} encoding:", line, maxsplit=1)[0])
            for line in proc.stdout.splitlines() if re.search(rf"{_COMMENT} encoding:", line)
        ]
    invalid_encoding = "invalid instruction encoding" in proc.stderr.lower()
    illegal = proc.returncode != 0 or (case.operation == "disassemble" and invalid_encoding)
    success = not illegal
    return {
        "backend": "native",
        "success": success,
        "illegal": illegal,
        "bytes": output_bytes.hex(),
        "disassembly": instructions if case.operation == "disassemble" else [],
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "returncode": proc.returncode,
        "command": _command(case, llvm_mc),
        "case": asdict(case),
    }
