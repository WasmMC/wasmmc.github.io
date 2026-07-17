# Third-party notices

WasmMC's original source code is licensed under the Apache License 2.0. The
complete project license is in `LICENSE`.

The generated JavaScript and WebAssembly backends contain or are linked with
third-party software. Those components remain under their own licenses.

## LLVM Project

WasmMC links LLVM MC target libraries, LLVM support libraries, libc++, and
compiler runtime components from the LLVM Project. LLVM is distributed under
the Apache License 2.0 with LLVM exceptions.

The Apache License 2.0 text is in `LICENSE`. The LLVM exceptions are reproduced
in `licenses/LLVM.txt`.

LLVM Project: https://llvm.org/

## Emscripten

The browser backends are compiled with Emscripten and include Emscripten runtime
support. Emscripten is offered under the MIT License or the University of
Illinois/NCSA Open Source License. WasmMC redistributes applicable Emscripten
portions under the MIT option reproduced in `licenses/EMSCRIPTEN.txt`.

Emscripten: https://emscripten.org/

## musl libc

Emscripten's C library support is derived in part from musl libc. Applicable
musl portions are distributed under the MIT License reproduced in
`licenses/MUSL.txt`.

musl libc: https://musl.libc.org/

## Build tools

CMake, Ninja, Python, Node.js, Binaryen, and GitHub Actions are used to build or
test WasmMC. They are not redistributed as part of the website merely because
they participated in the build.

No LLVM, Emscripten, or musl project name is used to imply endorsement of
WasmMC.
