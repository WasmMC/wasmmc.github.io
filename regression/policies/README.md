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

LLVM 23.1.5 native and WASM agree on 37 of 38 cases covering ARM, AArch64,
RISC-V, MIPS, SPARC, Hexagon, LoongArch, x86, PPC, BPF, and Thumb.

The sole known policy exception is the ARMv7 NEON baseline case:

- With no feature string, matching native and WASM builds may both accept the
  instruction despite the baseline rejection policy.
- Other matching builds reject it natively and accept it in WASM.
- Both reject it when passed `-neon,-mve` explicitly.
- Both accept it with `+neon` and emit the same bytes.

This isolates the difference to the unspecified ARM default feature mask. It
does not indicate a parser or encoder mismatch. The browser's success-based
probe cannot infer `+neon` when that baseline succeeds. The allowlist accepts
only the two exact observed signatures; any third behavior remains a failure.
