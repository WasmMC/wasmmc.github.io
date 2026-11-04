# WasmMC

LLVM Machine Code Playground in the Browser.

WasmMC assembles instructions into bytes and disassembles bytes back into
instructions without sending source code or binaries to a server. LLVM MC is
compiled to WebAssembly, split into target-family bundles, and loaded only when
the selected architecture needs it.

## What it does

- Assemble and disassemble with LLVM MC in the browser.
- Compare Intel and AT&T x86 syntax.
- Select target CPUs, features, and endianness.
- Probe for the minimum CPU and feature set when LLVM rejects an instruction at
  the current settings.
- Print decimal or hexadecimal immediates using LLVM's instruction printer.
- Switch between aliases and canonical mnemonics where LLVM supports it.
- Switch ARM, RISC-V, and LoongArch register naming styles.
- Display bytes as hexadecimal, `\xNN` escape sequences, Python bytes literals,
  or C arrays.
- Paste any of those byte formats back into the disassembler.
- Decode incomplete input while preserving unknown bytes as `.byte` rows.
- Use multiple assembler and disassembler panels with responsive layouts.
- Drag a raw binary of up to 500 KiB into a disassembler panel, then select a
  bounded offset and length without rendering the entire file at once.
- Share a workspace through the URL or opt into local browser persistence.
- Load target bundles lazily and unload idle bundles.

No browser extension, account, upload, or backend service is required.

## Supported targets

| Bundle | Browser targets |
|---|---|
| `mainstream` | x86 16/32/64, ARM A32, Thumb/Thumb-2, AArch64 |
| `systems` | RISC-V 32/64, MIPS 32/64, PowerPC 32/64, SPARC 32/64, WebAssembly 32/64, BPF, LoongArch 32/64, SystemZ |
| `embedded` | AVR, MSP430, M68k, Xtensa, Hexagon |

MIPS, PowerPC, and BPF expose little-endian and big-endian variants where LLVM
supports them. CPU and feature catalogs come from the pinned LLVM build rather
than a separate handwritten database.

The optional `full` artifact contains all listed families in one module for
direct API users and compatibility testing. The website does not download it.

## Assembly syntax

LLVM follows each target architecture's conventions rather than one universal
assembly language. Parser errors from LLVM are shown directly in the interface.
The official [llvm-mc command guide](https://llvm.org/docs/CommandGuide/llvm-mc.html)
documents the tool, while LLVM's
[MC tests](https://github.com/llvm/llvm-project/tree/main/llvm/test/MC)
provide practical target-specific examples. Architecture vendor manuals remain
the authoritative instruction references.

## Run locally

Serve a completed site artifact over HTTP:

```sh
cd dist
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly with a `file:`
URL is not supported because browsers restrict WebAssembly workers and fetches.
The Emscripten 6 backend targets Chrome 85 or newer, Firefox 79 or newer, and
Safari 15 or newer.

## Build

The pinned LLVM release is stored in `LLVM_VERSION`, its official GitHub
release-asset digest is stored in `LLVM_SHA256`, and the build toolchain release
is stored in `EMSCRIPTEN_VERSION`. Downloads that do not match the LLVM SHA-256
digest are rejected. A normal Emscripten build is:

```sh
mkdir -p build
cd build
emcmake cmake .. -DCMAKE_BUILD_TYPE=MinSizeRel -G Ninja
emmake ninja
cd ..
python3 scripts/stage_site.py
```

The staging command creates:

- `dist/`: the deployable site with fingerprinted frontend and split bundles.
- `full-dist/`: the optional all-target compatibility backend.

Only an explicit allowlist of browser files enters `dist/`. Generated filenames
contain content fingerprints, and the generated manifest connects each target
family to its matching JS and WASM pair. License and third-party notice files
are included in both release artifacts.

## Regression suite

The regression suite keeps one Node process alive for each WASM backend and
compares it with native `llvm-mc` from the same pinned LLVM release. The corpus
currently contains 1,539 instruction-level cases covering:

- Success and rejection behavior
- Assembled bytes
- Normalized disassembly text
- Illegal instruction handling
- CPU and feature gating
- Endianness and syntax variants
- LLVM printer options
- Split-bundle ownership

See [regression/README.md](regression/README.md) for commands, testcase format,
JSON reports, known differences, and target inventory policy.

## Verification and releases

Every release is compared with native `llvm-mc` built from the same pinned LLVM
source. The split modules, optional full module, generated site, target
inventory, and known-difference policy must all pass before the verified site
artifact can be deployed to GitHub Pages.

Compiled modules are cached by LLVM version, Emscripten version, target
inventory, CMake configuration, and C++ source. Frontend and documentation
changes reuse those exact binaries instead of rebuilding LLVM or relinking the
modules.

A weekly workflow checks official LLVM releases and proposes patch updates by
pull request. Major updates require an explicit manual request. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment behavior and repository
settings.

## License

WasmMC's original code is licensed under the Apache License 2.0. Generated
backends also contain LLVM, Emscripten runtime support, and musl-derived C
library support under their respective permissive licenses. See
[LICENSE](LICENSE), [NOTICE](NOTICE), and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
