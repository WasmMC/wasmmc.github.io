# Regression policy suites

These focused suites are intentionally separate from `testcases/`. They test
backend policy and boundary behavior rather than the ordinary instruction
corpus, and may document a known mismatch while it is being evaluated.

Run feature enforcement against a WASM backend:

```sh
python3 regression/compare.py regression/policies/feature_enforcement.tc \
  --backend-js full-dist/llvm_backend.js \
  --bundle full \
  --known-differences regression/known_differences.json
```

## Current result

LLVM 22.1.8 native and WASM agree on 37 of 38 cases covering ARM, AArch64,
RISC-V, MIPS, SPARC, Hexagon, LoongArch, x86, PPC, BPF, and Thumb.

The sole mismatch is the ARMv7 NEON baseline case:

- Native `llvm-mc-22 -mcpu=generic` rejects `vadd.i32 q0, q1, q2` unless NEON
  or MVE is enabled.
- WASM accepts the instruction when no feature string is supplied.
- Both reject it when passed `-neon,-mve` explicitly.
- Both accept it with `+neon` and emit the same bytes.

This isolates the difference to the WASM build's unspecified ARM default
feature mask. It does not indicate a parser or encoder mismatch. The browser's
success-based probe cannot infer `+neon` when that baseline succeeds.
