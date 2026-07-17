# Testcase format

Test files are UTF-8 text ending in `.tc`. A file may contain multiple cases:

```text
=== descriptive test name
operation = assemble
triple = x86_64-unknown-linux-gnu
cpu =
features = +avx,-sse4.2
intel_syntax = true
relax = false
printer_options = no-aliases,numeric
expect = success
split = none
wasm_target = required
---
mov rax, rbx
```

Each case starts with `=== `. Metadata continues to `---`; everything after that is the body, up to the next case. Blank lines and lines beginning with `#` are ignored in metadata.

Required fields:

- `operation`: `assemble` or `disassemble`.
- `triple`: the LLVM target triple.

Optional fields:

- `cpu`: passed as `-mcpu` and to the WASM API. Default: empty.
- `features`: comma-separated LLVM target attributes. Default: empty.
- `intel_syntax`: boolean. It selects the x86 parser and printer variant. Default: `false`.
- `relax`: boolean. It selects `-mc-relax-all` natively. Default: `false`.
- `printer_options`: comma-separated LLVM `-M` instruction-printer options for disassembly, such as `no-aliases`, `numeric`, or `reg-names-raw`. Default: empty.
- `expect`: `success` or `illegal`. Default: `success`.
- `split`: `none` or `lines`. With `lines`, every nonblank body line is an independent testcase named with a numeric suffix. This is useful for instruction corpora. Default: `none`.
- `wasm_target`: `required` or `optional`. An optional case is reported as `SKIP` only when the WASM API explicitly returns `Target lookup failed`; it is never counted as passed. Use this only for native LLVM targets intentionally absent from the current WASM build. Default: `required`.

An assembly body is LLVM assembly source. A disassembly body is whitespace-separated hexadecimal bytes; separators such as commas or `0x` prefixes are not accepted.

For successful assembly, the suite compares emitted instruction bytes. For successful disassembly, it compares normalized instruction text. Every case also compares success and illegal-instruction classification. Diagnostics are displayed on failure but are not compared because native and WebAssembly source locations differ.
