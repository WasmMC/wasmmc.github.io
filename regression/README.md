# Native and WebAssembly regression suite

This suite compares WasmMC with native `llvm-mc` from the same LLVM release.
It uses no browser automation. A persistent Node process loads an Emscripten
module directly and exchanges newline-delimited JSON requests with `compare.py`.

## Quick start

Run the smoke corpus against an un-fingerprinted local full build:

```sh
python3 regression/compare.py regression/testcases/smoke.tc \
  --llvm-mc /usr/bin/llvm-mc-22 \
  --backend-js build/llvm_backend.js \
  --bundle full
```

Run a split bundle from a staged site:

```sh
systems_js=$(python3 scripts/site_asset.py dist systems js)
python3 regression/compare.py regression/testcases \
  --llvm-mc /usr/bin/llvm-mc-22 \
  --backend-js "$systems_js" \
  --bundle systems
```

Useful options include:

- `--llvm-mc PATH`: select the native reference executable.
- `--backend-js PATH`: select the Emscripten module.
- `--bundle NAME`: filter cases to `full`, `mainstream`, `systems`, or `embedded`.
- `--json-report PATH`: write a schema-1 machine-readable report.
- `-q`: print only failures and totals.
- `-v`: print every case.

Exit status is 0 for a match, 1 for regression differences, and 2 for harness
or configuration errors.

## What is compared

Every applicable case compares:

- Assembly or disassembly success
- Illegal-instruction classification
- Emitted instruction bytes for assembly
- Normalized instruction text for disassembly

The native adapter obtains bytes from `llvm-mc --show-encoding`. These are
instruction-level tests, not object-layout tests. Symbols, sections, debug
information, and complete relocation tables are outside the comparison scope.

WebAssembly assembly is a special case because LLVM emits a complete WebAssembly
object rather than ordinary ELF text bytes. WebAssembly disassembly is compared
normally.

## Corpus and bundle ownership

The default corpus contains 1,539 cases:

| Bundle | Families | Cases |
|---|---|---:|
| `mainstream` | X86, ARM, AArch64 | 547 |
| `systems` | RISC-V, MIPS, PowerPC, SPARC, WebAssembly, BPF, LoongArch, SystemZ | 697 |
| `embedded` | AVR, MSP430, M68k, Xtensa, Hexagon | 295 |
| `full` | Every family above | 1,539 |

Every triple must map to exactly one split bundle. An unmapped target is a
harness error. Split case counts must sum to the full count.

See [testcases/FORMAT.md](testcases/FORMAT.md) for the testcase format. Cases
may specify CPU, features, syntax, relaxation, expected rejection behavior, and
LLVM printer options.

## Policy suites

Focused policy coverage lives under `policies/` rather than the ordinary
instruction corpus. Feature enforcement currently contains 38 cases covering
baseline rejection, explicit enabling, and permissive LLVM target behavior.

```sh
python3 regression/compare.py regression/policies/feature_enforcement.tc \
  --suite-name feature-enforcement \
  --backend-js full-dist/llvm_backend.js \
  --bundle full \
  --known-differences regression/known_differences.json \
  --json-report reports/feature-enforcement-full.json
```

Known differences are explicit entries in `known_differences.json`:

- `KNOWN` means the documented mismatch still reproduces and does not fail CI.
- `XPASS` means the mismatch disappeared, fails CI, and requires allowlist review.
- Any unlisted difference is a failure.

Each entry lists one or more exact accepted signatures. This permits documented
toolchain-specific outcomes without allowing other failures in a named case to
pass unnoticed.

CI runs feature enforcement against the full backend and all three split
backends. This ensures policy behavior is checked against the modules used by
the browser, not only the compatibility module.

## JSON reports

`--json-report` records:

- LLVM version
- JS and WASM sizes and SHA-256 hashes
- Suite duration and totals
- Per-case configuration
- Native and WASM results
- Diagnostics and differences
- Final status

The contract is described by `report-schema.json`. `report_summary.py` validates
report totals, rejects harness errors, checks split coverage, and writes the
Markdown table used in the GitHub Actions summary.

## Target inventory

`llvm-target-inventory.json` records every stable and experimental target in the
pinned LLVM release. Each family must belong to one bundle or have an explicit
exclusion reason.

During configuration, `scripts/check_llvm_targets.py` reads LLVM's own stable
and experimental target lists. It fails on additions, removals, promotions,
demotions, version drift, duplicate ownership, or missing dispositions. It also
generates the target lists used by native and WASM builds.

## Test organization

- `testcases/`: ordinary architecture corpora.
- `policies/`: focused behavior and boundary suites.
- `llvm_runner.py`: native `llvm-mc` adapter.
- `wasm_runner.mjs`: persistent Emscripten adapter.
- `compare.py`: comparison and report driver.
- `test_backend_integration.mjs`: real worker and backend integration.
- `test_backend_lifecycle.mjs`: lazy-load and unload lifecycle.
- `test_site_staging.py`: fingerprinting and artifact separation.
- `test_reporting.py`: bundle ownership and reporting policy.
- `test_target_inventory.py`: upstream target inventory behavior.
- `test_release_checker.py`: LLVM update policy.
- `test_text_policy.py`: repository-authored text rules.
