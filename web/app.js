'use strict';

const SITE_NAME='WasmMC';
const SITE_TAGLINE='LLVM Machine Code Playground in the Browser';

// ── Architecture definitions ───────────────────────────────────────────────────
//
// Each entry defines:
//   key        unique ID used in state/DOM
//   label      button text
//   triple     LLVM target triple
//   syntax     'both' = Intel/AT&T toggle visible | 'one' = hidden
//   defaultAsm example for Intel (or only) syntax
//   defaultAtt example for AT&T syntax (x86 only)
//   cpus       array of {label, value} CPU preset options ("" = generic)
//   features   array of {label, flag, default, tip} toggleable feature chips
//   relaxOpt   true = show Relax toggle
//
const ARCHS = [
  {
    key:'x86-16', label:'x86 16', triple:'i386-unknown-linux-gnu',
    syntax:'both',
    defaultAsm:'mov ax, 1\nret',
    defaultAtt:'movw $1, %ax\nretw',
    cpus:[
      {label:'Generic', value:''},
      {label:'i386',    value:'i386'},
      {label:'i486',    value:'i486'},
      {label:'i586',    value:'i586'},
      {label:'i686',    value:'i686'},
    ],
    features:[],
    relaxOpt:false,
  },
  {
    key:'x86-32', label:'x86 32', triple:'i386-unknown-linux-gnu',
    syntax:'both',
    defaultAsm:'mov eax, 1\nret',
    defaultAtt:'movl $1, %eax\nretl',
    cpus:[
      {label:'Generic', value:''},
      {label:'i386',    value:'i386'},
      {label:'i686',    value:'i686'},
      {label:'Pentium4',value:'pentium4'},
    ],
    features:[
      {label:'SSE',  flag:'+sse',  def:false, tip:'SSE instructions'},
      {label:'SSE2', flag:'+sse2', def:false, tip:'SSE2 instructions'},
      {label:'SSE3', flag:'+sse3', def:false, tip:'SSE3 instructions'},
    ],
    relaxOpt:false,
  },
  {
    key:'x86-64', label:'x86 64', triple:'x86_64-unknown-linux-gnu',
    syntax:'both',
    defaultAsm:'mov eax, 1\nxor ecx, ecx\nret',
    defaultAtt:'movl $1, %eax\nxorl %ecx, %ecx\nretq',
    cpus:[
      {label:'Generic',  value:''},
      {label:'x86-64',   value:'x86-64'},
      {label:'x86-64-v2',value:'x86-64-v2'},
      {label:'x86-64-v3',value:'x86-64-v3'},
      {label:'Znver4',   value:'znver4'},
      {label:'Skylake',  value:'skylake'},
      {label:'Alderlake',value:'alderlake'},
    ],
    features:[
      {label:'AVX',    flag:'+avx',    def:false, tip:'AVX (256-bit SIMD)'},
      {label:'AVX2',   flag:'+avx2',   def:false, tip:'AVX2 integer SIMD'},
      {label:'AVX512F',flag:'+avx512f',def:false, tip:'AVX-512 foundation'},
      {label:'BMI',    flag:'+bmi',    def:false, tip:'Bit manipulation (BMI1)'},
      {label:'BMI2',   flag:'+bmi2',   def:false, tip:'Bit manipulation (BMI2)'},
      {label:'AES',    flag:'+aes',    def:false, tip:'AES-NI instructions'},
      {label:'SHA',    flag:'+sha',    def:false, tip:'SHA instructions'},
      {label:'ADX',    flag:'+adx',    def:false, tip:'Multi-precision add-carry'},
    ],
    relaxOpt:false,
  },
  {
    key:'arm', label:'ARM', triple:'armv7-unknown-linux-gnueabihf',
    syntax:'one',
    defaultAsm:'add r0, r0, #1\nbx lr',
    cpus:[
      {label:'Generic',    value:''},
      // ── Application cores (A-profile, support ARM+Thumb state) ──
      {label:'Cortex-A5',  value:'cortex-a5'},
      {label:'Cortex-A7',  value:'cortex-a7'},
      {label:'Cortex-A8',  value:'cortex-a8'},
      {label:'Cortex-A9',  value:'cortex-a9'},
      {label:'Cortex-A12', value:'cortex-a12'},
      {label:'Cortex-A15', value:'cortex-a15'},
      {label:'Cortex-A17', value:'cortex-a17'},
      {label:'Cortex-A32', value:'cortex-a32'},
      {label:'Cortex-A35', value:'cortex-a35'},
      {label:'Cortex-A53', value:'cortex-a53'},
      {label:'Cortex-A55', value:'cortex-a55'},
      {label:'Cortex-A57', value:'cortex-a57'},
      {label:'Cortex-A72', value:'cortex-a72'},
      {label:'Cortex-A73', value:'cortex-a73'},
      // ── Realtime cores (R-profile, support ARM+Thumb state) ──
      {label:'Cortex-R4',  value:'cortex-r4'},
      {label:'Cortex-R5',  value:'cortex-r5'},
      {label:'Cortex-R7',  value:'cortex-r7'},
      // ── Other ──
      {label:'Krait',      value:'krait'},
      {label:'Swift',      value:'swift'},
    ],
    features:[
      {label:'NEON',   flag:'+neon',   def:false, tip:'NEON SIMD'},
      {label:'VFP2',   flag:'+vfp2',   def:false, tip:'VFPv2 floating point'},
      {label:'VFP3',   flag:'+vfp3',   def:false, tip:'VFPv3 floating point'},
      {label:'VFP4',   flag:'+vfp4',   def:false, tip:'VFPv4 (fused multiply-add)'},
      {label:'Thumb2', flag:'+thumb2', def:false, tip:'Thumb-2 extensions'},
      {label:'Crypto', flag:'+crypto', def:false, tip:'Crypto extensions'},
      {label:'DSP',    flag:'+dsp',    def:false, tip:'DSP instructions'},
      {label:'FP-ARMv8',flag:'+fp-armv8',def:false,tip:'FP ARMv8'},
    ],
    relaxOpt:false,
  },
  {
    key:'arm-t', label:'ARM Thumb', triple:'thumbv7-unknown-linux-gnueabihf',
    syntax:'one',
    defaultAsm:'movs r0, #1\nbx lr',
    // M-profile cores are Thumb-only and need a different triple (no Linux ABI,
    // no HF for M0/M3). cpuTriple overrides the arch triple for that CPU.
    cpuTriples:{
      'cortex-m0':     'thumbv6m-none-eabi',
      'cortex-m0plus': 'thumbv6m-none-eabi',
      'cortex-m1':     'thumbv6m-none-eabi',
      'cortex-m23':    'thumbv8m.base-none-eabi',
      'cortex-m3':     'thumbv7m-none-eabi',
      'cortex-m4':     'thumbv7em-none-eabihf',
      'cortex-m7':     'thumbv7em-none-eabihf',
      'cortex-m33':    'thumbv8m.main-none-eabihf',
      'cortex-m35p':   'thumbv8m.main-none-eabihf',
      'cortex-m55':    'thumbv8m.main-none-eabihf',
    },
    cpus:[
      {label:'Generic',     value:''},
      // ── M-profile (Thumb-only) ──
      {label:'Cortex-M0',   value:'cortex-m0'},
      {label:'Cortex-M0+',  value:'cortex-m0plus'},
      {label:'Cortex-M1',   value:'cortex-m1'},
      {label:'Cortex-M3',   value:'cortex-m3'},
      {label:'Cortex-M4',   value:'cortex-m4'},
      {label:'Cortex-M7',   value:'cortex-m7'},
      {label:'Cortex-M23',  value:'cortex-m23'},
      {label:'Cortex-M33',  value:'cortex-m33'},
      {label:'Cortex-M35P', value:'cortex-m35p'},
      {label:'Cortex-M55',  value:'cortex-m55'},
      // ── A-profile (also support Thumb state) ──
      {label:'Cortex-A7',   value:'cortex-a7'},
      {label:'Cortex-A8',   value:'cortex-a8'},
      {label:'Cortex-A9',   value:'cortex-a9'},
      {label:'Cortex-A15',  value:'cortex-a15'},
      {label:'Cortex-A53',  value:'cortex-a53'},
    ],
    features:[
      {label:'NEON',   flag:'+neon',   def:false, tip:'NEON SIMD'},
      {label:'VFP3',   flag:'+vfp3',   def:false, tip:'VFPv3 floating point'},
      {label:'Thumb2', flag:'+thumb2', def:false, tip:'Thumb-2 extensions'},
      {label:'DSP',    flag:'+dsp',    def:false, tip:'DSP instructions'},
    ],
    relaxOpt:false,
  },
  {
    key:'arm64', label:'AArch64', triple:'aarch64-unknown-linux-gnu',
    syntax:'one',
    defaultAsm:'add x0, x0, #1\nret',
    cpus:[
      {label:'Generic',       value:''},
      // ── Cortex-A (application) ──
      {label:'Cortex-A35',    value:'cortex-a35'},
      {label:'Cortex-A53',    value:'cortex-a53'},
      {label:'Cortex-A55',    value:'cortex-a55'},
      {label:'Cortex-A57',    value:'cortex-a57'},
      {label:'Cortex-A65',    value:'cortex-a65'},
      {label:'Cortex-A72',    value:'cortex-a72'},
      {label:'Cortex-A73',    value:'cortex-a73'},
      {label:'Cortex-A75',    value:'cortex-a75'},
      {label:'Cortex-A76',    value:'cortex-a76'},
      {label:'Cortex-A77',    value:'cortex-a77'},
      {label:'Cortex-A78',    value:'cortex-a78'},
      {label:'Cortex-A510',   value:'cortex-a510'},
      {label:'Cortex-A520',   value:'cortex-a520'},
      {label:'Cortex-A710',   value:'cortex-a710'},
      {label:'Cortex-A715',   value:'cortex-a715'},
      {label:'Cortex-A720',   value:'cortex-a720'},
      {label:'Cortex-A725',   value:'cortex-a725'},
      // ── Cortex-X (high perf) ──
      {label:'Cortex-X1',     value:'cortex-x1'},
      {label:'Cortex-X2',     value:'cortex-x2'},
      {label:'Cortex-X3',     value:'cortex-x3'},
      {label:'Cortex-X4',     value:'cortex-x4'},
      {label:'Cortex-X925',   value:'cortex-x925'},
      // ── Cortex-R (realtime) ──
      {label:'Cortex-R82',    value:'cortex-r82'},
      // ── Apple Silicon ── (note: M1-M3 not in LLVM 22; use A-series or M4+)
      {label:'Apple A14',     value:'apple-a14'},
      {label:'Apple A15',     value:'apple-a15'},
      {label:'Apple A16',     value:'apple-a16'},
      {label:'Apple A17',     value:'apple-a17'},
      {label:'Apple M4',      value:'apple-m4'},
      {label:'Apple M5',      value:'apple-m5'},
      // ── Neoverse (server/cloud) ──
      {label:'Neoverse-E1',   value:'neoverse-e1'},
      {label:'Neoverse-N1',   value:'neoverse-n1'},
      {label:'Neoverse-N2',   value:'neoverse-n2'},
      {label:'Neoverse-N3',   value:'neoverse-n3'},
      {label:'Neoverse-V1',   value:'neoverse-v1'},
      {label:'Neoverse-V2',   value:'neoverse-v2'},
      {label:'Neoverse-V3',   value:'neoverse-v3'},
      // ── Other notable ──
      {label:'Ampere1',       value:'ampere1'},
      {label:'Ampere1B',      value:'ampere1b'},
      {label:'Ampere1C',      value:'ampere1c'},
      {label:'Fujitsu A64FX', value:'a64fx'},
      {label:'Kryo',          value:'kryo'},
      {label:'Falkor',        value:'falkor'},
      {label:'Exynos-M3',     value:'exynos-m3'},
      {label:'Exynos-M5',     value:'exynos-m5'},
    ],
    features:[
      {label:'SVE',     flag:'+sve',      def:false, tip:'Scalable Vector Extension (not on Apple silicon)'},
      {label:'SVE2',    flag:'+sve2',     def:false, tip:'SVE2 extension'},
      {label:'SME',     flag:'+sme',      def:false, tip:'Scalable Matrix Extension (M4+)'},
      {label:'SME2',    flag:'+sme2',     def:false, tip:'SME version 2'},
      {label:'LSE',     flag:'+lse',      def:false, tip:'Large System Ext (atomics)'},
      {label:'Crypto',  flag:'+crypto',   def:false, tip:'Crypto (AES/SHA)'},
      {label:'DOTPROD', flag:'+dotprod',  def:false, tip:'Dot product instructions'},
      {label:'FP16',    flag:'+fullfp16', def:false, tip:'Full FP16 support'},
      {label:'BF16',    flag:'+bf16',     def:false, tip:'BFloat16'},
      {label:'I8MM',    flag:'+i8mm',     def:false, tip:'Int8 matrix multiply'},
      {label:'MTE',     flag:'+mte',      def:false, tip:'Memory Tagging Extension'},
      {label:'RCpc',    flag:'+rcpc',     def:false, tip:'Release-consistent PC (LDAPR)'},
    ],
    relaxOpt:false,
  },
  {
    key:'riscv32', label:'RISC-V 32', triple:'riscv32-unknown-elf',
    syntax:'one',
    defaultAsm:'addi a0, a0, 1\njalr zero, 0(ra)',
    cpus:[
      {label:'Generic',         value:''},
      {label:'Generic RV32',    value:'generic-rv32'},
      {label:'SiFive-E20',      value:'sifive-e20'},
      {label:'SiFive-E21',      value:'sifive-e21'},
      {label:'SiFive-E24',      value:'sifive-e24'},
      {label:'SiFive-E31',      value:'sifive-e31'},
      {label:'SiFive-E34',      value:'sifive-e34'},
      {label:'SiFive-E76',      value:'sifive-e76'},
      {label:'Rocket RV32',     value:'rocket-rv32'},
      {label:'RP2350 (Hazard3)',value:'rp2350-hazard3'},
      {label:'Syntacore SCR1',  value:'syntacore-scr1-base'},
    ],
    features:[
      {label:'M (mul/div)',  flag:'+m', def:false, tip:'Integer multiply/divide'},
      {label:'A (atomics)',  flag:'+a', def:false, tip:'Atomic instructions'},
      {label:'F (float)',    flag:'+f', def:false, tip:'Single-precision FP'},
      {label:'D (double)',   flag:'+d', def:false, tip:'Double-precision FP'},
      {label:'C (compress)', flag:'+c', def:false, tip:'Compressed 16-bit insns'},
      {label:'Zicsr',        flag:'+zicsr', def:false, tip:'CSR instructions'},
      {label:'Zifencei',     flag:'+zifencei',def:false,tip:'Fence.i instruction'},
    ],
    relaxOpt:true,
  },
  {
    key:'riscv64', label:'RISC-V 64', triple:'riscv64-unknown-elf',
    syntax:'one',
    defaultAsm:'addi a0, a0, 1\njalr zero, 0(ra)',
    cpus:[
      {label:'Generic',          value:''},
      {label:'Generic RV64',     value:'generic-rv64'},
      {label:'Generic OOO',      value:'generic-ooo'},
      {label:'SiFive-U54',       value:'sifive-u54'},
      {label:'SiFive-U74',       value:'sifive-u74'},
      {label:'SiFive-P450',      value:'sifive-p450'},
      {label:'SiFive-P550',      value:'sifive-p550'},
      {label:'SiFive-P670',      value:'sifive-p670'},
      {label:'SiFive-P870',      value:'sifive-p870'},
      {label:'SiFive-X280',      value:'sifive-x280'},
      {label:'SiFive-X390',      value:'sifive-x390'},
      {label:'Rocket RV64',      value:'rocket-rv64'},
      {label:'SpacemiT-X60',     value:'spacemit-x60'},
      {label:'XiangShan Nanhu',  value:'xiangshan-nanhu'},
      {label:'Veyron-V1',        value:'veyron-v1'},
      {label:'TT Ascalon D8',    value:'tt-ascalon-d8'},
    ],
    features:[
      {label:'M (mul/div)',  flag:'+m', def:false, tip:'Integer multiply/divide'},
      {label:'A (atomics)',  flag:'+a', def:false, tip:'Atomic instructions'},
      {label:'F (float)',    flag:'+f', def:false, tip:'Single-precision FP'},
      {label:'D (double)',   flag:'+d', def:false, tip:'Double-precision FP'},
      {label:'C (compress)', flag:'+c', def:false, tip:'Compressed 16-bit insns'},
      {label:'V (vector)',   flag:'+v', def:false, tip:'Vector extension'},
      {label:'Zicsr',        flag:'+zicsr', def:false, tip:'CSR instructions'},
    ],
    relaxOpt:true,
  },
  {
    key:'mips32', label:'MIPS 32', triple:'mipsel-unknown-linux-gnu', tripleBE:'mips-unknown-linux-gnu',
    syntax:'one', endianOpt:true, defaultEndian:'le',
    endianTipLE:'LE: PlayStation, embedded (mipsel)', endianTipBE:'BE: router firmware, N64 (mips)',
    defaultAsm:'addiu $v0, $zero, 1\njr $ra\nnop',
    cpus:[
      {label:'Generic', value:''},
      {label:'MIPS32',  value:'mips32'},
      {label:'MIPS32r2',value:'mips32r2'},
      {label:'MIPS32r6',value:'mips32r6'},
      {label:'P5600',   value:'p5600'},
    ],
    features:[
      {label:'MSA',    flag:'+msa',    def:false, tip:'MIPS SIMD Architecture'},
      {label:'FP64',   flag:'+fp64',   def:false, tip:'64-bit FP registers'},
      {label:'DSP',    flag:'+dsp',    def:false, tip:'DSP extension'},
    ],
    relaxOpt:false,
  },
  {
    key:'mips64', label:'MIPS 64', triple:'mips64el-unknown-linux-gnu', tripleBE:'mips64-unknown-linux-gnu',
    syntax:'one', endianOpt:true, defaultEndian:'le',
    endianTipLE:'LE: embedded, some network gear (mips64el)', endianTipBE:'BE: router firmware, Octeon (mips64)',
    defaultAsm:'daddiu $v0, $zero, 1\njr $ra\nnop',
    cpus:[
      {label:'Generic', value:''},
      {label:'MIPS64',  value:'mips64'},
      {label:'MIPS64r2',value:'mips64r2'},
      {label:'MIPS64r6',value:'mips64r6'},
      {label:'Octeon',  value:'octeon'},
    ],
    features:[
      {label:'MSA', flag:'+msa', def:false, tip:'MIPS SIMD Architecture'},
      {label:'DSP', flag:'+dsp', def:false, tip:'DSP extension'},
    ],
    relaxOpt:false,
  },
  {
    key:'ppc32', label:'PPC 32', triple:'powerpc-unknown-linux-gnu',
    syntax:'one',
    // PPC32 is almost exclusively big-endian in the wild (Wii, Xbox 360, old Macs).
    defaultAsm:'li 3, 1\nblr',
    cpus:[
      {label:'Generic', value:''},
      {label:'440',     value:'440'},
      {label:'450',     value:'450'},
      {label:'601',     value:'601'},
      {label:'602',     value:'602'},
      {label:'603',     value:'603'},
      {label:'604',     value:'604'},
      {label:'G3 (750)',value:'ppc750'},
      {label:'G4 (7400)',value:'7400'},
      {label:'G5 (970)', value:'970'},
      {label:'e500',    value:'e500'},
      {label:'e500mc',  value:'e500mc'},
    ],
    features:[
      {label:'Altivec', flag:'+altivec', def:false, tip:'AltiVec SIMD'},
    ],
    relaxOpt:false,
  },
  {
    key:'ppc64', label:'PPC 64', triple:'powerpc64le-unknown-linux-gnu', tripleBE:'powerpc64-unknown-linux-gnu',
    syntax:'one', endianOpt:true, defaultEndian:'be',
    endianTipLE:'LE: IBM POWER9/10 Linux (powerpc64le)', endianTipBE:'BE: PS3, Cell, old POWER (powerpc64)',
    defaultAsm:'li 3, 1\nblr',
    cpus:[
      {label:'Generic', value:''},
      {label:'PPC64',   value:'ppc64'},
      {label:'PPC64LE', value:'ppc64le'},
      {label:'POWER3',  value:'pwr3'},
      {label:'POWER4',  value:'pwr4'},
      {label:'POWER5',  value:'pwr5'},
      {label:'POWER6',  value:'pwr6'},
      {label:'POWER7',  value:'pwr7'},
      {label:'POWER8',  value:'pwr8'},
      {label:'POWER9',  value:'pwr9'},
      {label:'POWER10', value:'pwr10'},
      {label:'POWER11', value:'pwr11'},
      {label:'Future',  value:'future'},
      {label:'Cell',    value:'cell'},
      {label:'G5 (970)',value:'970'},
      {label:'A2',      value:'a2'},
    ],
    features:[
      {label:'Altivec', flag:'+altivec', def:false, tip:'AltiVec SIMD'},
      {label:'VSX',     flag:'+vsx',     def:false, tip:'Vector Scalar Extension'},
    ],
    relaxOpt:false,
  },
  {
    key:'sparc32', label:'SPARC 32', triple:'sparc-unknown-linux-gnu',
    syntax:'one',
    defaultAsm:'add %o0, 1, %o0\nretl\nnop',
    cpus:[
      {label:'Generic', value:''},
      {label:'V8',      value:'v8'},
      {label:'SuperSPARC',value:'supersparc'},
    ],
    features:[],
    relaxOpt:false,
  },
  {
    key:'sparc64', label:'SPARC 64', triple:'sparcv9-unknown-linux-gnu',
    syntax:'one',
    defaultAsm:'add %o0, 1, %o0\nretl\nnop',
    cpus:[
      {label:'Generic', value:''},
      {label:'V9',      value:'v9'},
      {label:'UltraSPARC',value:'ultrasparc'},
      {label:'Niagara', value:'niagara'},
    ],
    features:[
      {label:'VIS',  flag:'+vis',  def:false, tip:'Visual Instruction Set'},
      {label:'VIS2', flag:'+vis2', def:false, tip:'VIS version 2'},
    ],
    relaxOpt:false,
  },
  {
    key:'wasm32', label:'WASM 32', triple:'wasm32-unknown-unknown',
    syntax:'one',
    defaultAsm:'i32.const 1\ndrop\nend_function',
    cpus:[{label:'Generic', value:''}],
    features:[
      {label:'SIMD',      flag:'+simd128',   def:false, tip:'128-bit SIMD'},
      {label:'Atomics',   flag:'+atomics',   def:false, tip:'Atomic operations'},
      {label:'Bulk-mem',  flag:'+bulk-memory',def:false,tip:'Bulk memory ops'},
      {label:'Ref-types', flag:'+reference-types',def:false,tip:'Reference types'},
    ],
    relaxOpt:false,
  },
  {
    key:'wasm64', label:'WASM 64', triple:'wasm64-unknown-unknown',
    syntax:'one',
    defaultAsm:'i64.const 1\ndrop\nend_function',
    cpus:[{label:'Generic', value:''}],
    features:[
      {label:'SIMD',    flag:'+simd128', def:false, tip:'128-bit SIMD'},
      {label:'Atomics', flag:'+atomics', def:false, tip:'Atomic operations'},
    ],
    relaxOpt:false,
  },
  {
    key:'bpf', label:'BPF', triple:'bpfel-unknown-unknown', tripleBE:'bpf-unknown-unknown',
    syntax:'one', endianOpt:true, defaultEndian:'le',
    endianTipLE:'LE: eBPF on x86/ARM/RISC-V (bpfel)', endianTipBE:'BE: classic BPF, s390x (bpf)',
    defaultAsm:'mov r0, 1\nexit',
    // CPU gates real instruction availability in LLVM's BPFSubtarget:
    cpus:[
      {label:'Generic', value:''},
      {label:'BPFv1',   value:'v1'},
      {label:'BPFv2',   value:'v2'},
      {label:'BPFv3',   value:'v3'},
      {label:'BPFv4',   value:'v4'},
    ],
    features:[
      {label:'ALU32', flag:'+alu32', def:false, tip:'Enable 32-bit ALU instruction selection (w0-w10 ops). Confirmed real LLVM feature flag; v3+ also auto-enables this internally.'},
    ],
    relaxOpt:false,
  },
  {
    key:'hexagon', label:'Hexagon', triple:'hexagon-unknown-linux-musl',
    syntax:'one',
    defaultAsm:'{ r0 = #1 }\njumpr r31',
    cpus:[
      {label:'Generic', value:''},
      {label:'V60',     value:'hexagonv60'},
      {label:'V62',     value:'hexagonv62'},
      {label:'V65',     value:'hexagonv65'},
      {label:'V66',     value:'hexagonv66'},
      {label:'V67',     value:'hexagonv67'},
      {label:'V67T',    value:'hexagonv67t'},
      {label:'V68',     value:'hexagonv68'},
      {label:'V69',     value:'hexagonv69'},
      {label:'V71',     value:'hexagonv71'},
      {label:'V71T',    value:'hexagonv71t'},
      {label:'V73',     value:'hexagonv73'},
      {label:'V75',     value:'hexagonv75'},
      {label:'V79',     value:'hexagonv79'},
      {label:'V81',     value:'hexagonv81'},
    ],
    features:[
      {label:'HVX',     flag:'+hvx',     def:false, tip:'Hexagon Vector eXtensions'},
      {label:'HVX-v66', flag:'+hvxv66',  def:false, tip:'HVX v66'},
      {label:'Audio',   flag:'+audio',   def:false, tip:'Audio extensions'},
    ],
    relaxOpt:false,
  },
  {
    key:'loongarch32', label:'LoongArch 32', triple:'loongarch32-unknown-linux-gnu',
    syntax:'one', defaultAsm:'addi.w $a0, $a0, 1',
    cpus:[
      {label:'Generic', value:''},
      {label:'Generic LA32', value:'generic-la32'},
      {label:'LoongArch 32', value:'loongarch32'},
    ],
    features:[
      {label:'F', flag:'+f', def:false, tip:'Single-precision floating point'},
      {label:'D', flag:'+d', def:false, tip:'Double-precision floating point'},
      {label:'LBT', flag:'+lbt', def:false, tip:'Loongson Binary Translation extension'},
    ],
    relaxOpt:false,
  },
  {
    key:'loongarch64', label:'LoongArch 64', triple:'loongarch64-unknown-linux-gnu',
    syntax:'one', defaultAsm:'addi.d $a0, $a0, 1',
    cpus:[
      {label:'Generic', value:''},
      {label:'Generic LA64', value:'generic-la64'},
      {label:'LA464', value:'la464'},
      {label:'LA664', value:'la664'},
    ],
    features:[
      {label:'F', flag:'+f', def:false, tip:'Single-precision floating point'},
      {label:'D', flag:'+d', def:false, tip:'Double-precision floating point'},
      {label:'LSX', flag:'+lsx', def:false, tip:'Loongson SIMD Extension'},
      {label:'LASX', flag:'+lasx', def:false, tip:'Loongson Advanced SIMD Extension'},
      {label:'LBT', flag:'+lbt', def:false, tip:'Loongson Binary Translation extension'},
    ],
    relaxOpt:false,
  },
  {
    key:'systemz', label:'SystemZ', triple:'s390x-unknown-linux-gnu',
    syntax:'one', defaultAsm:'lghi %r0, 1',
    cpus:[
      {label:'Generic', value:''},
      {label:'z10', value:'z10'},
      {label:'z13', value:'z13'},
      {label:'z14', value:'z14'},
      {label:'z15', value:'z15'},
      {label:'z16', value:'z16'},
      {label:'z17', value:'z17'},
    ],
    features:[
      {label:'Vector', flag:'+vector', def:false, tip:'Vector facility'},
      {label:'Vector Enh. 1', flag:'+vector-enhancements-1', def:false, tip:'Vector enhancements facility 1'},
      {label:'Vector Enh. 2', flag:'+vector-enhancements-2', def:false, tip:'Vector enhancements facility 2'},
      {label:'Vector Enh. 3', flag:'+vector-enhancements-3', def:false, tip:'Vector enhancements facility 3'},
    ],
    relaxOpt:false,
  },
  {key:'avr',label:'AVR',triple:'avr-unknown-unknown',syntax:'one',defaultAsm:'ldi r16, 1\nret',cpus:[{label:'Generic',value:''},{label:'ATmega328P',value:'atmega328p'}],features:[],relaxOpt:false},
  {
    key:'msp430', label:'MSP430', triple:'msp430-unknown-unknown',
    syntax:'one', defaultAsm:'mov #1, r4\nret',
    cpus:[
      {label:'Generic', value:''},
      {label:'MSP430', value:'msp430'},
      {label:'MSP430X', value:'msp430x'},
    ],
    features:[
      {label:'EXT', flag:'+ext', def:false, tip:'MSP430-X extensions'},
      {label:'HW Mult 16', flag:'+hwmult16', def:false, tip:'16-bit hardware multiplier'},
      {label:'HW Mult 32', flag:'+hwmult32', def:false, tip:'32-bit hardware multiplier'},
      {label:'HW Mult F5', flag:'+hwmultf5', def:false, tip:'F5 series hardware multiplier'},
    ],
    relaxOpt:false,
  },
  {key:'m68k',label:'M68k',triple:'m68k-unknown-linux-gnu',syntax:'one',defaultAsm:'moveq #1, %d0\nrts',cpus:[{label:'Generic',value:'generic'},{label:'68020',value:'M68020'}],features:[],relaxOpt:false},
  {key:'xtensa',label:'Xtensa',triple:'xtensa-unknown-elf',syntax:'one',defaultAsm:'movi a2, 1\nret',cpus:[{label:'Generic',value:'generic'},{label:'ESP32',value:'esp32'},{label:'ESP8266',value:'esp8266'}],features:[],relaxOpt:false},
];

const ARCH_MAP = Object.fromEntries(ARCHS.map(a=>[a.key, a]));

// ── Global state ──────────────────────────────────────────────────────────────
const backendManager = new LLVMBackendManager(window.WASMMC_ASSETS||{});
backendManager.onStatus(status=>{
  const memory=status.reduce((sum,item)=>sum+item.heapBytes,0)/(1024*1024);
  const button=document.getElementById('backend-status-btn');
  if(button){button.textContent=`Modules: ${status.length} · ${memory.toFixed(0)} MiB memory`;button.title=status.length?status.map(x=>`${x.name}${x.idle?' (idle)':''}`).join(', ')+'. Click to unload idle modules.':'No modules loaded';}
});
document.getElementById('backend-status-btn').addEventListener('click',()=>backendManager.unloadUnused());
let llvmMod    = null; // truthy after the manifest is ready; retained for UI guards
const STORAGE_PREFIX='disasm:';
let rememberWorkspace=localStorage.getItem(STORAGE_PREFIX+'remember')==='1';
if(!rememberWorkspace){
  ['disasm_workspace','liveMode','layoutIdx','theme'].forEach(key=>localStorage.removeItem(key));
}
const savedValue=(key,fallback)=>rememberWorkspace?(localStorage.getItem(STORAGE_PREFIX+key)??fallback):fallback;
const persistValue=(key,value)=>{if(rememberWorkspace)localStorage.setItem(STORAGE_PREFIX+key,value);};
let liveMode   = savedValue('liveMode','0') === '1';
let panelCount = 0;
const panelState = {};
const liveTimers = {};
let workspaceSaveTimer = null;
const MAX_RENDER_ROWS=10000;

const LAYOUTS = ['auto','side','stack'];
let layoutIdx = parseInt(savedValue('layoutIdx','0'),10)||0;
if(layoutIdx<0||layoutIdx>=LAYOUTS.length) layoutIdx=0;

// ── Compression helpers ───────────────────────────────────────────────────────
async function packData(buffer) {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter(); w.write(new Uint8Array(buffer)); w.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  let s=''; const b=new Uint8Array(buf); for(let i=0;i<b.byteLength;i++) s+=String.fromCharCode(b[i]);
  return btoa(s);
}
async function unpackData(b64) {
  const s=atob(b64); const b=new Uint8Array(s.length); for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i);
  const ds=new DecompressionStream('deflate-raw'); const w=ds.writable.getWriter(); w.write(b); w.close();
  return new Response(ds.readable).arrayBuffer();
}

// ── Persistence ───────────────────────────────────────────────────────────────
function getWorkspaceJSON() {
  const state = {panels:[]};
  Object.keys(panelState).forEach(id=>{
    const p=panelState[id];
    const ta=document.getElementById(`${p.type}-in-${id}`);
    const ba=document.getElementById(`dis-baddr-${id}`);
    if(!ta) return;
    state.panels.push({
      type:p.type, arch:p.selectedArch, text:ta.value,
      baddr:ba?ba.value:'', show:Array.from(getShow(id)),
      tab:p.type==='asm'?p.asmTab:p.disTab, upper:p.hexUpper, immHex:p.immHex,
      printerOptions:Array.from(p.printerOptions),
      printerCapabilities:Array.from(p.printerCapabilities),
      syntax:p.syntax, cpu:p.cpu, features:Array.from(p.features), relax:p.relax, endian:p.endian,
      title:document.getElementById(`${p.type}-title-sub-${id}`)?.textContent||''
    });
  });
  return JSON.stringify(state);
}
function saveWorkspace(){ persistValue('workspace', getWorkspaceJSON()); }
function queueSave(){ if(!rememberWorkspace)return; clearTimeout(workspaceSaveTimer); workspaceSaveTimer=setTimeout(saveWorkspace,400); }

document.getElementById('clear-data-btn').addEventListener('click',()=>{
  for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith(STORAGE_PREFIX))localStorage.removeItem(key);}
  window.location.hash=''; window.location.reload();
});
function renderPersistence(){
  document.getElementById('remember-btn').textContent='Remember workspace: '+(rememberWorkspace?'on':'off');
  document.getElementById('clear-data-btn').style.display=rememberWorkspace?'':'none';
}
document.getElementById('remember-btn').addEventListener('click',()=>{
  rememberWorkspace=!rememberWorkspace;
  if(rememberWorkspace){localStorage.setItem(STORAGE_PREFIX+'remember','1');saveWorkspace();}
  else for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith(STORAGE_PREFIX))localStorage.removeItem(key);}
  renderPersistence();
});
renderPersistence();

// ── Engine pill ───────────────────────────────────────────────────────────────
function setPill(state, tip){
  const pill=document.getElementById('llvm-pill');
  pill.className='status-pill '+state;
  document.getElementById('llvm-tip').textContent=tip;
}

function renderSiteMetadata(version='22',buildYear=String(new Date().getUTCFullYear())){
  document.title=SITE_NAME;
  document.getElementById('site-name').setAttribute('aria-label',SITE_NAME);
  document.getElementById('site-tagline').textContent=SITE_TAGLINE;
  document.getElementById('site-footer').textContent=
    `© ${buildYear} ${SITE_NAME} · LLVM MC ${version} WASM · hack the planet`;
}

// ── LLVM call wrappers ────────────────────────────────────────────────────────
function buildFeaturesStr(archKey, activeFeatures) {
  const arch = ARCH_MAP[archKey];
  if (!arch) return '';
  // Always-on defaults first, then user toggles
  const parts = arch.features
    .filter(f => f.def || activeFeatures.has(f.flag))
    .map(f => f.flag);
  return parts.join(',');
}

function effectiveTriple(archKey, endian, cpu) {
  const arch = ARCH_MAP[archKey];
  if (!arch) return '';
  // Per-CPU triple override (used by ARM Thumb M-profile cores which each need
  // their own ABI triple, such as thumbv6m-none-eabi for Cortex-M0).
  if (cpu && arch.cpuTriples && arch.cpuTriples[cpu]) return arch.cpuTriples[cpu];
  if (arch.endianOpt && endian === 'be' && arch.tripleBE) return arch.tripleBE;
  return arch.triple;
}

function bundleForArch(archKey) {
  if (/^(x86-|arm$|arm-t$|arm64$)/.test(archKey)) return 'mainstream';
  if (/^(avr|msp430|m68k|xtensa|hexagon)/.test(archKey)) return 'embedded';
  return 'systems';
}

function backendOptions(archKey, cpu, activeFeatures, intelSyntax, relax, endian) {
  const arch = ARCH_MAP[archKey];
  if (!arch) throw new Error('Unknown arch key: ' + archKey);
  const triple = effectiveTriple(archKey, endian||'le', cpu||'');
  return {arch, triple, cpu:cpu||'', features:Array.from(activeFeatures||[]),
    cpuCandidates:arch.cpus.map(c=>c.value), featureCandidates:arch.features.map(f=>f.flag),
    intelSyntax, relax};
}

async function llvmAssemble(id, asmText, archKey, cpu, activeFeatures, intelSyntax, relax, endian) {
  const options=backendOptions(archKey,cpu,activeFeatures,intelSyntax,relax,endian);
  // For ARM Thumb: prepend .thumb directive so the LLVM MC parser enters Thumb
  // mode. Even with a thumb-prefixed triple the directive is needed because
  // the generic assembler starts in ARM mode for armv7 triples. M-profile
  // cpuTriple overrides (e.g. thumbv6m-none-eabi) already imply Thumb-only so
  // the directive is still harmless and ensures consistent behaviour.
  let src = asmText;
  if (archKey === 'arm-t') src = '.thumb\n' + src;
  return backendManager.request(bundleForArch(archKey),'assembleAuto',{...options,source:src},id);
}

async function llvmDisassemble(id, bytes, archKey, cpu, activeFeatures, intelSyntax, endian,
                               immHex=false, printerOptions=[]) {
  const options=backendOptions(archKey,cpu,activeFeatures,intelSyntax,false,endian);
  // effectiveTriple already returns a thumb-prefixed triple for arm-t
  // (e.g. thumbv7-unknown-linux-gnueabihf, or thumbv6m-none-eabi for M-profile
  // CPUs). The thumb arch prefix is what tells the LLVM disassembler to decode
  // Thumb instructions, with no +thumb-mode feature injection needed.
  return backendManager.request(bundleForArch(archKey),'disassembleAuto',
    {...options,bytes:Array.from(bytes),immHex,printerOptions:Array.from(printerOptions)},id);
}

function applyDetectedConfig(id, result) {
  if (!result.changed) return;
  const st=panelState[id];
  st.cpu=result.cpu||''; st.features=new Set(result.features||[]);
  const wrap=document.getElementById('wrap-'+id);
  if(wrap) rebuildOpts(id,st.type,wrap,st.selectedArch);
  queueSave();
}

function applyPrinterCapabilities(id, result) {
  if (!Array.isArray(result.printerOptionsSupported)) return;
  const st=panelState[id]; if(!st) return;
  const supported=new Set(result.printerOptionsSupported);
  const before=Array.from(st.printerCapabilities).sort().join(',');
  const selectedBefore=Array.from(st.printerOptions).sort().join(',');
  const after=Array.from(supported).sort().join(',');
  st.printerCapabilities=supported;
  st.printerOptions=new Set(Array.from(st.printerOptions).filter(option=>supported.has(option)));
  const selectedAfter=Array.from(st.printerOptions).sort().join(',');
  if(before!==after||selectedBefore!==selectedAfter){
    const wrap=document.getElementById('wrap-'+id);
    if(wrap) rebuildOpts(id,st.type,wrap,st.selectedArch);
    queueSave();
  }
}

// ── Layout / Theme / Live ─────────────────────────────────────────────────────
function applyLayout(){
  const g=document.getElementById('panel-grid'), l=LAYOUTS[layoutIdx];
  g.className='panel-grid layout-'+l;
  document.querySelectorAll('.layout-choice').forEach(button=>{
    const active=button.dataset.layout===l;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
}
document.querySelectorAll('.layout-choice').forEach(button=>{
  button.addEventListener('click',()=>{
    layoutIdx=LAYOUTS.indexOf(button.dataset.layout);
    persistValue('layoutIdx',layoutIdx); applyLayout();
  });
});

let isDark=savedValue('theme','dark')!=='light';
const SUN_ICON=`<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
const MOON_ICON=`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
function renderThemeButton(){
  const button=document.getElementById('theme-btn');
  const action=isDark?'Switch to light theme':'Switch to dark theme';
  document.getElementById('theme-icon').innerHTML=isDark?SUN_ICON:MOON_ICON;
  button.title=action; button.setAttribute('aria-label',action);
}
document.getElementById('theme-btn').addEventListener('click',function(){
  isDark=!isDark; persistValue('theme',isDark?'dark':'light');
  document.documentElement.setAttribute('data-theme',isDark?'dark':'light');
  renderThemeButton();
});
document.getElementById('live-btn').addEventListener('click',function(){
  liveMode=!liveMode; persistValue('liveMode',liveMode?'1':'0');
  this.classList.toggle('active',liveMode);
});

// ── Share URL ─────────────────────────────────────────────────────────────────
document.getElementById('share-btn').addEventListener('click',async function(){
  this.disabled=true;
  try {
    const b64=await packData(new TextEncoder().encode(getWorkspaceJSON()).buffer);
    const url=new URL(window.location.href); url.hash='state='+encodeURIComponent(b64);
    if(url.toString().length>8000){alert('Workspace too large. Trim some code.');}
    else{
      await navigator.clipboard.writeText(url.toString());
      const orig=this.innerHTML;
      this.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Copied!</span>';
      setTimeout(()=>this.innerHTML=orig,2000);
    }
  } catch(e){alert('Failed to generate share link.');}
  this.disabled=false;
});

// ── Drag and Drop ─────────────────────────────────────────────────────────────
document.addEventListener('dragover',e=>{e.preventDefault();document.body.classList.add('is-dragging');});
document.addEventListener('dragleave',e=>{if(e.clientX===0||e.clientY===0)document.body.classList.remove('is-dragging');});
document.addEventListener('drop',async e=>{
  e.preventDefault(); document.body.classList.remove('is-dragging');
  const file=e.dataTransfer.files[0]; if(!file) return;
  if(file.size>window.WasmMCByteInput.MAX_FILE_BYTES){alert('File too large. Max 500 KiB.');return;}
  if(file.size<1){alert('The selected file is empty.');return;}
  const bytes=new Uint8Array(await file.arrayBuffer());
  const wrap=e.target.closest('.panel-wrap');
  let id=wrap?wrap.id.replace('wrap-',''):null;
  if(!id||!panelState[id]||panelState[id].type!=='dis') id=addPanel('dis');
  const st=panelState[id];
  st.binarySource={name:file.name,bytes,offset:0,
    length:Math.min(bytes.length,window.WasmMCByteInput.DEFAULT_FILE_WINDOW_BYTES)};
  const sub=document.getElementById(`dis-title-sub-${id}`);
  if(sub) sub.textContent=file.name;
  updateBinaryWindowControls(id);
  applyBinaryWindow(id);
});

function clearBinarySource(id){
  const st=panelState[id];
  if(!st?.binarySource) return;
  st.binarySource=null;
  const row=document.getElementById(`dis-window-${id}`);
  if(row) row.hidden=true;
}

function updateBinaryWindowControls(id){
  const source=panelState[id]?.binarySource;
  const row=document.getElementById(`dis-window-${id}`);
  if(!source||!row) return;
  row.hidden=false;
  document.getElementById(`dis-window-offset-${id}`).value=String(source.offset);
  document.getElementById(`dis-window-length-${id}`).value=String(source.length);
  const last=source.offset+source.length-1;
  document.getElementById(`dis-window-summary-${id}`).textContent=
    `${source.name}: bytes ${source.offset.toLocaleString()}-${last.toLocaleString()} of ${source.bytes.length.toLocaleString()}`;
}

function applyBinaryWindow(id){
  const st=panelState[id], source=st?.binarySource;
  if(!source) return;
  try{
    const offset=window.WasmMCByteInput.parseWindowValue(
      document.getElementById(`dis-window-offset-${id}`).value,'Offset');
    const length=window.WasmMCByteInput.parseWindowValue(
      document.getElementById(`dis-window-length-${id}`).value,'Length');
    const range=window.WasmMCByteInput.clampFileWindow(source.bytes.length,offset,length);
    source.offset=range.offset; source.length=range.length;
  }catch(error){alert(error.message);return;}
  const windowBytes=source.bytes.subarray(source.offset,source.offset+source.length);
  document.getElementById(`dis-in-${id}`).value=
    Array.from(windowBytes,byte=>byte.toString(16).padStart(2,'0')).join(' ');
  updateBinaryWindowControls(id);
  queueSave();
  if(liveMode&&llvmMod) scheduleRun(id,'dis');
}

// ── Arch options panel builder ────────────────────────────────────────────────
function buildOptsHTML(id, type, archKey, state) {
  const arch = ARCH_MAP[archKey];
  if (!arch) return '';
  const syn    = state.syntax   || 'intel';
  const cpu    = state.cpu      || '';
  const relax  = state.relax    || false;
  const feats  = state.features || new Set();
  const printerOptions = state.printerOptions || new Set();
  const printerCapabilities = state.printerCapabilities || new Set();
  const isX86  = arch.syntax === 'both';

  let html = '<div class="arch-opts">';

  if (isX86) {
    html += `<div class="opts-section"><div class="opts-row">
      <span class="opts-label">Syntax</span>
      <button class="tog-btn${syn==='intel'?' active':''}" data-opt="syntax" data-val="intel">Intel</button>
      <button class="tog-btn${syn==='att'?' active':''}"   data-opt="syntax" data-val="att">AT&amp;T</button>
    </div></div>`;
  }

  if (arch.endianOpt) {
    const endian = state.endian || arch.defaultEndian || 'le';
    const leTip = arch.endianTipLE || 'Little-endian';
    const beTip = arch.endianTipBE || 'Big-endian';
    html += `<div class="opts-section"><div class="opts-row">
      <span class="opts-label">Endian</span>
      <button class="tog-btn${endian==='le'?' active':''}" data-opt="endian" data-val="le" title="${leTip}">LE</button>
      <button class="tog-btn${endian==='be'?' active':''}" data-opt="endian" data-val="be" title="${beTip}">BE</button>
    </div></div>`;
  }

  if (arch.cpus.length > 1) {
    const opts = arch.cpus.map(c=>`<option value="${c.value}"${c.value===cpu?' selected':''}>${c.value===''?'Default':c.label}</option>`).join('');
    html += `<div class="opts-section"><div class="opts-row">
      <span class="opts-label">CPU</span>
      <select class="cpu-select" data-opt="cpu">${opts}</select>
    </div></div>`;
  }

  if (arch.features.length > 0) {
    const chips = arch.features.map(f=>`<button class="feat-chip${feats.has(f.flag)?' active':''}" data-opt="feat" data-flag="${f.flag}" title="${f.tip}">${f.label}</button>`).join('');
    html += `<div class="opts-section"><div class="opts-row">
      <span class="opts-label">Features</span>
      <div class="feat-chips${arch.catalogLoaded?' catalog-features':''}">${chips}</div>
    </div></div>`;
  }

  html += `<div class="opts-section"><div class="opts-row">
    <span class="opts-label">LLVM</span>
    ${arch.catalogLoaded?`<input class="baddr-input feature-filter" placeholder="filter ${arch.features.length} features" style="width:180px">`:
      `<button class="tog-btn" data-opt="load-catalog">Load all CPUs and features</button>`}
  </div></div>`;

  if (type === 'asm' && arch.relaxOpt) {
    html += `<div class="opts-section"><div class="opts-row">
      <span class="opts-label">Relax</span>
      <button class="tog-btn${relax?' active':''}" data-opt="relax" title="Allow assembler to use larger encodings when needed">Allow relax</button>
    </div></div>`;
  }

  if (printerCapabilities.has('no-aliases')) {
    html += `<div class="opts-section"><div class="opts-row">
      <span class="opts-label">Mnemonics</span>
      <button class="tog-btn${printerOptions.has('no-aliases')?'':' active'}" data-opt="printer" data-group="mnemonics" data-val="" title="Prefer LLVM instruction aliases">Aliases</button>
      <button class="tog-btn${printerOptions.has('no-aliases')?' active':''}" data-opt="printer" data-group="mnemonics" data-val="no-aliases" title="Print canonical instructions without aliases">Canonical</button>
    </div></div>`;
  }

  const registerOption = printerCapabilities.has('numeric') ? 'numeric'
    : printerCapabilities.has('reg-names-raw') ? 'reg-names-raw' : '';
  if (registerOption) {
    const alternateLabel=registerOption==='numeric'?'Numeric':'Raw';
    html += `<div class="opts-section"><div class="opts-row">
      <span class="opts-label">Registers</span>
      <button class="tog-btn${printerOptions.has(registerOption)?'':' active'}" data-opt="printer" data-group="registers" data-val="" title="Use ABI register names">ABI</button>
      <button class="tog-btn${printerOptions.has(registerOption)?' active':''}" data-opt="printer" data-group="registers" data-val="${registerOption}" title="Use ${alternateLabel.toLowerCase()} register names">${alternateLabel}</button>
    </div></div>`;
  }

  html += '</div>';
  return html;
}

// ── Panel HTML builders ───────────────────────────────────────────────────────
function archButtonsHTML(activeKey) {
  return ARCHS.map(a=>
    `<button class="arch-btn${a.key===activeKey?' active':''}" data-arch="${a.key}">${a.label}</button>`
  ).join('');
}

function assemblyPlaceholder(arch, syntax) {
  return syntax==='att' && arch.defaultAtt ? arch.defaultAtt : (arch.defaultAsm||'');
}

function restoredPanelTitle(title) {
  return title==='Bytes'||title==='Instructions' ? '' : (title||'');
}

function buildAsmPanel(id, defArch, initText, initTitle, initState) {
  const title  = restoredPanelTitle(initTitle);
  const arch   = ARCH_MAP[defArch] || ARCH_MAP['arm64'];
  const sample = (initText !== null && initText !== undefined) ? initText : '';
  return `
<div class="panel">
  <div class="panel-header">
    <span class="panel-title">
      <span class="panel-title-main">Assemble</span>
      <span class="panel-title-sub" id="asm-title-sub-${id}">${esc(title)}</span>
    </span>
    <button class="close-btn" onclick="closePanel('${id}')" title="Close">×</button>
  </div>
  <div class="panel-body">
    <textarea class="asm-textarea" id="asm-in-${id}" rows="6"
      spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off"
      placeholder="${esc(assemblyPlaceholder(arch,initState?.syntax||'intel'))}">${esc(sample)}</textarea>
    <div class="arch-row" id="asm-archs-${id}">${archButtonsHTML(defArch)}</div>
    <div id="asm-opts-${id}">${buildOptsHTML(id,'asm',defArch,initState||{})}</div>
    <div class="run-action">
      <button class="run-btn asm-run-btn" id="asm-run-${id}" disabled>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><polygon points="1,0.5 9.5,5 1,9.5"/></svg>
        <span>Assemble</span>
      </button>
    </div>
    <div class="output-section" id="asm-sec-${id}" style="display:none">
      <div class="output-tabs" id="asm-tabs-${id}">
        <button class="out-tab active" data-tab="hex">Hex<span class="tabtip">click again to toggle UPPER/lower</span></button>
        <button class="out-tab" data-tab="inline">Inline \\x<span class="tabtip">click again to toggle UPPER/lower</span></button>
        <button class="out-tab" data-tab="python">Python b""</button>
        <button class="out-tab" data-tab="carray">C Array</button>
        <button class="out-tab" data-tab="disasm">Disassembly<span class="tabtip">click again to toggle DEC/hex immediates</span></button>
      </div>
      <div class="output-box" id="asm-out-${id}">
        <button class="copy-btn" onclick="copyOut('asm-out-${id}')">copy</button>
      </div>
      <div class="stat-line" id="asm-stat-${id}"></div>
    </div>
  </div>
</div>`;
}

function buildDisPanel(id, defArch, initText, initBaddr, initShow, initTitle, initState) {
  const title   = restoredPanelTitle(initTitle);
  const arch    = ARCH_MAP[defArch] || ARCH_MAP['arm64'];
  const showArr = initShow || ['addr','bytes','ins'];
  return `
<div class="panel">
  <div class="panel-header">
    <span class="panel-title">
      <span class="panel-title-main">Disassemble</span>
      <span class="panel-title-sub" id="dis-title-sub-${id}">${esc(title)}</span>
    </span>
    <button class="close-btn" onclick="closePanel('${id}')" title="Close">×</button>
  </div>
  <div class="panel-body">
    <textarea class="asm-textarea dis-textarea" id="dis-in-${id}" rows="6"
      spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off"
      placeholder="c0 03 5f d6&#10;e0 03 01 aa&#10;00 00 01 8b">${esc(initText||'')}</textarea>
    <div class="binary-window-row" id="dis-window-${id}" hidden>
      <span class="binary-window-summary" id="dis-window-summary-${id}"></span>
      <label>Offset <input type="text" class="baddr-input binary-window-input" id="dis-window-offset-${id}" value="0" inputmode="numeric"></label>
      <label>Length <input type="text" class="baddr-input binary-window-input" id="dis-window-length-${id}" value="${window.WasmMCByteInput.DEFAULT_FILE_WINDOW_BYTES}" inputmode="numeric"></label>
      <button class="tog-btn" id="dis-window-apply-${id}" type="button">Apply range</button>
    </div>
    <div class="arch-row" id="dis-archs-${id}">${archButtonsHTML(defArch)}</div>
    <div id="dis-opts-${id}">${buildOptsHTML(id,'dis',defArch,initState||{})}</div>
    <div class="opts-row" style="margin-top:9px">
      <span class="opts-label" style="min-width:auto;margin-right:8px">Show:</span>
      <button class="tog-btn${showArr.includes('addr')?' active':''}"  data-show="addr">Addresses</button>
      <button class="tog-btn${showArr.includes('bytes')?' active':''}" data-show="bytes">Bytecodes</button>
      <button class="tog-btn${showArr.includes('ins')?' active':''}"   data-show="ins">Instructions</button>
    </div>
    <div class="baddr-row">
      <span class="baddr-label">Base addr</span>
      <input type="text" class="baddr-input" id="dis-baddr-${id}"
        spellcheck="false" autocorrect="off" autocomplete="off"
        value="${esc(initBaddr||'0x00000000')}" placeholder="0x0 or 0x100+64">
    </div>
    <div class="run-action">
      <button class="run-btn dis-run-btn" id="dis-run-${id}" disabled>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><polygon points="1,0.5 9.5,5 1,9.5"/></svg>
        <span>Disassemble</span>
      </button>
    </div>
    <div class="output-section" id="dis-sec-${id}" style="display:none">
      <div class="output-tabs" id="dis-tabs-${id}">
        <button class="out-tab active" data-tab="pretty">Disassembly<span class="tabtip">click again to toggle DEC/hex immediates</span></button>
        <button class="out-tab" data-tab="hex">Raw Hex<span class="tabtip">click again to toggle UPPER/lower</span></button>
        <button class="out-tab" data-tab="inline">Inline \\x<span class="tabtip">click again to toggle UPPER/lower</span></button>
        <button class="out-tab" data-tab="python">Python b""</button>
        <button class="out-tab" data-tab="carray">C Array</button>
      </div>
      <div class="output-box" id="dis-out-${id}">
        <button class="copy-btn" onclick="copyOut('dis-out-${id}')">copy</button>
      </div>
      <div class="stat-line" id="dis-stat-${id}"></div>
    </div>
  </div>
</div>`;
}

// ── Panel creation + event wiring ─────────────────────────────────────────────
function addPanel(type, initState=null) {
  const id  = 'p'+(++panelCount);
  const def = initState?.arch || 'arm64';

  const savedFeats = initState?.features;
  const featureSet = savedFeats instanceof Set ? savedFeats
    : Array.isArray(savedFeats) ? new Set(savedFeats) : new Set();

  const archDef0 = ARCH_MAP[def];
  const savedFeats2 = initState?.features;
  const featureSetFinal = savedFeats2 !== undefined
    ? featureSet
    // No saved state: disassembly defaults to ALL extensions enabled (maximize
    // instruction recognition coverage when decoding unknown bytes); assembly
    // defaults to none (so output reflects a deliberately chosen target).
    : (type === 'dis' && archDef0?.features?.length
        ? new Set(archDef0.features.map(f=>f.flag))
        : new Set());
  panelState[id] = {
    type, selectedArch: def,
    syntax:   initState?.syntax  || 'intel',
    cpu:      initState?.cpu     || '',
    features: featureSetFinal,
    relax:    initState?.relax   || false,
    endian:   initState?.endian  || archDef0?.defaultEndian || 'le',
    asmTab:   initState?.tab     || 'hex',
    disTab:   initState?.tab     || 'pretty',
    hexUpper: initState?.upper   !== undefined ? initState.upper : true,
    immHex:   initState?.immHex  === true,
    printerOptions:new Set(initState?.printerOptions||[]),
    printerCapabilities:new Set(initState?.printerCapabilities||[]),
    requestGeneration:0, outputGeneration:0,
    asmBytes: null, disInsns: null, disBytes: null,
    binarySource:null,
  };

  const wrap = document.createElement('div');
  wrap.className = 'panel-wrap'; wrap.id = 'wrap-'+id;

  if (type==='asm') {
    wrap.innerHTML = buildAsmPanel(id, def, initState?.text ?? null, initState?.title, panelState[id]);
  } else {
    wrap.innerHTML = buildDisPanel(id, def, initState?.text ?? null, initState?.baddr, initState?.show, initState?.title, panelState[id]);
  }
  document.getElementById('panel-grid').appendChild(wrap);

  if (initState?.tab) {
    wrap.querySelectorAll('.out-tab').forEach(t=>t.classList.remove('active'));
    wrap.querySelector(`[data-tab="${initState.tab}"]`)?.classList.add('active');
  }

  // ── Arch button clicks ──
  wrap.querySelector(`#${type}-archs-${id}`).addEventListener('click', e=>{
    const btn = e.target.closest('.arch-btn');
    if (!btn) return;
    wrap.querySelectorAll('.arch-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');

    const archKey = btn.getAttribute('data-arch');
    const newArch = ARCH_MAP[archKey];
    const oldBundle=bundleForArch(panelState[id].selectedArch);
    const newBundle=bundleForArch(archKey);
    if(oldBundle!==newBundle) backendManager.release(oldBundle,id);
    panelState[id].requestGeneration++;
    panelState[id].outputGeneration++;

    panelState[id].selectedArch = archKey;
    panelState[id].cpu      = '';
    panelState[id].features = (type === 'dis' && newArch?.features?.length)
      ? new Set(newArch.features.map(f=>f.flag))
      : new Set();
    panelState[id].relax    = false;
    panelState[id].endian   = newArch?.defaultEndian || 'le';
    panelState[id].printerOptions = new Set();
    panelState[id].printerCapabilities = new Set();
    if (newArch.syntax === 'one') panelState[id].syntax = 'intel';
    if (type === 'asm') {
      const textarea=wrap.querySelector('.asm-textarea');
      if(textarea)textarea.placeholder=assemblyPlaceholder(newArch,panelState[id].syntax);
    }

    // Explicitly hide and clear previous output on architecture change
    const sec = wrap.querySelector('.output-section');
    if (sec) sec.style.display = 'none';
    if (type === 'asm') {
        panelState[id].asmBytes = null;
    } else {
        panelState[id].disInsns = null;
        panelState[id].disBytes = null;
    }

    rebuildOpts(id, type, wrap, archKey);
    queueSave();
    if (liveMode && llvmMod) scheduleRun(id, type);
  });

  // ── Options panel event delegation ──
  bindOptsEvents(id, type, wrap);

  // ── Show toggles (dis) ──
  wrap.querySelectorAll('[data-show]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      btn.classList.toggle('active'); queueSave();
      if (panelState[id].disInsns) renderDisOutput(id);
    });
  });

  // ── Run button + textarea ──
  if (type==='asm') {
    const runBtn = wrap.querySelector('.asm-run-btn');
    if (llvmMod) runBtn.disabled=false;
    runBtn.addEventListener('click',()=>doAssemble(id));
    wrap.querySelector('.asm-textarea').addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();doAssemble(id);}
    });
    wrap.querySelector('.asm-textarea').addEventListener('input',()=>{
      queueSave(); if(liveMode&&llvmMod) scheduleRun(id,'asm');
    });
    initTabsWithToggle(wrap,'asm-tabs-'+id,['hex','inline'],['disasm'],t=>{
      panelState[id].asmTab=t; queueSave();
      if(panelState[id].asmBytes) renderAsmOutput(id);
    },()=>{ queueSave(); if(panelState[id].asmBytes) renderAsmOutput(id); });

  } else {
    const runBtn = wrap.querySelector('.dis-run-btn');
    if (llvmMod) runBtn.disabled=false;
    runBtn.addEventListener('click',()=>doDisassemble(id));
    wrap.querySelector('.dis-textarea').addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();doDisassemble(id);}
    });
    wrap.querySelector('.dis-textarea').addEventListener('input',()=>{
      clearBinarySource(id);
      queueSave(); if(liveMode&&llvmMod) scheduleRun(id,'dis');
    });
    wrap.querySelector(`#dis-window-apply-${id}`).addEventListener('click',()=>applyBinaryWindow(id));
    wrap.querySelectorAll('.binary-window-input').forEach(input=>input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();applyBinaryWindow(id);}
    }));
    wrap.querySelector(`#dis-baddr-${id}`).addEventListener('input',()=>{
      queueSave(); if(liveMode&&llvmMod) scheduleRun(id,'dis');
    });
    initTabsWithToggle(wrap,'dis-tabs-'+id,['hex','inline'],['pretty'],t=>{
      panelState[id].disTab=t; queueSave();
      if(panelState[id].disInsns) renderDisOutput(id);
    },()=>{
      queueSave();
      if(panelState[id].disTab==='pretty'&&panelState[id].disBytes) doDisassemble(id);
      else if(panelState[id].disInsns) renderDisOutput(id);
    });
  }

  queueSave();
  return id;
}

function rebuildOpts(id, type, wrap, archKey) {
  const container = wrap.querySelector(`#${type}-opts-${id}`);
  if (!container) return;
  container.innerHTML = buildOptsHTML(id, type, archKey, panelState[id]);
  bindOptsEvents(id, type, wrap);
}

async function loadCatalogOptions(id,type,wrap) {
  const st=panelState[id], arch=ARCH_MAP[st.selectedArch];
  const response=await backendManager.request(bundleForArch(st.selectedArch),'capabilities',
    {triple:effectiveTriple(st.selectedArch,st.endian,st.cpu),cpu:st.cpu||''},id);
  const cpuMap=new Map(arch.cpus.map(item=>[item.value,item]));
  response.cpus.forEach(cpu=>{if(!cpuMap.has(cpu))cpuMap.set(cpu,{label:cpu,value:cpu});});
  arch.cpus=[...cpuMap.values()];
  const featureMap=new Map(arch.features.map(item=>[item.flag,item]));
  response.features.forEach(feature=>{
    const flag='+'+feature.name;
    const existing=featureMap.get(flag);
    if(existing)existing.tip=feature.description||existing.tip||feature.name;
    else featureMap.set(flag,{label:feature.name,flag,def:false,tip:feature.description||feature.name});
  });
  st.printerCapabilities=new Set(response.printerOptions||[]);
  st.printerOptions=new Set(Array.from(st.printerOptions).filter(option=>st.printerCapabilities.has(option)));
  arch.features=[...featureMap.values()]; arch.catalogLoaded=true;
  if(type==='dis') arch.features.forEach(feature=>st.features.add(feature.flag));
  rebuildOpts(id,type,wrap,st.selectedArch);
}

function bindOptsEvents(id, type, wrap) {
  const container = wrap.querySelector(`#${type}-opts-${id}`);
  if (!container) return;

  const loadCatalog=container.querySelector('[data-opt="load-catalog"]');
  if(loadCatalog) loadCatalog.addEventListener('click',async()=>{
    loadCatalog.disabled=true; loadCatalog.textContent='Loading…';
    try{await loadCatalogOptions(id,type,wrap);}catch(error){loadCatalog.disabled=false;loadCatalog.textContent='Load failed';console.error(error);}
  });
  const featureFilter=container.querySelector('.feature-filter');
  if(featureFilter) featureFilter.addEventListener('input',()=>{
    const query=featureFilter.value.trim().toLowerCase();
    container.querySelectorAll('[data-opt="feat"]').forEach(button=>{
      button.style.display=!query||button.textContent.toLowerCase().includes(query)?'':'none';
    });
  });

  container.querySelectorAll('[data-opt="syntax"]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const val = btn.getAttribute('data-val');
      container.querySelectorAll('[data-opt="syntax"]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      panelState[id].syntax = val;
      if(type==='asm'){
        const arch=ARCH_MAP[panelState[id].selectedArch];
        const textarea=wrap.querySelector('.asm-textarea');
        if(textarea)textarea.placeholder=assemblyPlaceholder(arch,val);
      }
      queueSave();
      if (liveMode && llvmMod) scheduleRun(id, type);
    });
  });

  const cpuSel = container.querySelector('[data-opt="cpu"]');
  if (cpuSel) {
    cpuSel.addEventListener('change',()=>{
      panelState[id].cpu = cpuSel.value; queueSave();
      if (liveMode && llvmMod) scheduleRun(id, type);
    });
  }

  container.querySelectorAll('[data-opt="feat"]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const flag = btn.getAttribute('data-flag');
      btn.classList.toggle('active');
      if (btn.classList.contains('active')) panelState[id].features.add(flag);
      else panelState[id].features.delete(flag);
      queueSave();
      if (liveMode && llvmMod) scheduleRun(id, type);
    });
  });

  container.querySelectorAll('[data-opt="endian"]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const val = btn.getAttribute('data-val');
      container.querySelectorAll('[data-opt="endian"]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      panelState[id].endian = val;

      queueSave();
      if (liveMode && llvmMod) scheduleRun(id, type);
    });
  });

  const relaxBtn = container.querySelector('[data-opt="relax"]');
  if (relaxBtn) {
    relaxBtn.addEventListener('click',()=>{
      relaxBtn.classList.toggle('active');
      panelState[id].relax = relaxBtn.classList.contains('active');
      queueSave();
      if (liveMode && llvmMod) scheduleRun(id, type);
    });
  }

  container.querySelectorAll('[data-opt="printer"]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const group=btn.getAttribute('data-group');
      const option=btn.getAttribute('data-val');
      container.querySelectorAll(`[data-opt="printer"][data-group="${group}"]`).forEach(groupButton=>{
        groupButton.classList.toggle('active',groupButton===btn);
        const groupOption=groupButton.getAttribute('data-val');
        if(groupOption) panelState[id].printerOptions.delete(groupOption);
      });
      if(option) panelState[id].printerOptions.add(option);
      queueSave();
      const st=panelState[id];
      if(type==='dis'&&st.disBytes) doDisassemble(id);
      else if(type==='asm'&&st.asmBytes&&st.asmTab==='disasm') renderAsmOutput(id);
    });
  });
}

// ── Assemble ──────────────────────────────────────────────────────────────────
function doAssemble(id) {
  if (!llvmMod) return;

  const st = panelState[id];
  if (!st) return;
  const requestGeneration=++st.requestGeneration;
  st.asmBytes = null; // Clear previous state early

  const src   = document.getElementById('asm-in-'+id)?.value.trim();
  const sec   = document.getElementById('asm-sec-'+id);
  const outEl = document.getElementById('asm-out-'+id);
  if (!src||!outEl) { if(sec) sec.style.display='none'; return; }

  setTimeout(async()=>{
    if(panelState[id]!==st||st.requestGeneration!==requestGeneration)return;
    let result;
    try { result = await llvmAssemble(id,src, st.selectedArch, st.cpu, st.features, st.syntax==='intel', st.relax, st.endian); }
    catch(e) {
      if(panelState[id]!==st||st.requestGeneration!==requestGeneration)return;
      showErr(outEl,'Unable to assemble: '+e.message); sec.style.display=''; return;
    }
    if(panelState[id]!==st||st.requestGeneration!==requestGeneration)return;

    applyDetectedConfig(id,result);
    const resultText=result.raw;
    if (resultText.startsWith('ERROR:')) { showErr(outEl,formatAssemblyError(result)); sec.style.display=''; return; }

    const bytes = resultText.trim().split(/\s+/).map(h=>parseInt(h,16)).filter(b=>!isNaN(b));
    if (!bytes.length) { showErr(outEl,'No bytes produced. Check instruction syntax.'); sec.style.display=''; return; }
    st.asmBytes = bytes; sec.style.display='';
    document.getElementById('asm-stat-'+id).textContent = bytes.length+' byte'+(bytes.length!==1?'s':'');
    renderAsmOutput(id);
  },10);
}

function renderAsmOutput(id) {
  const st=panelState[id], outEl=document.getElementById('asm-out-'+id);
  if (!outEl||!st?.asmBytes) return;
  const bytes=st.asmBytes, upper=st.hexUpper;
  const outputGeneration=++st.outputGeneration;
  const cb=`<button class="copy-btn" onclick="copyOut('asm-out-${id}')">copy</button>`;
  outEl.className='output-box';
  switch(st.asmTab){
    case 'hex':    outEl.innerHTML=cb+fmtHexHL(bytes,upper); break;
    case 'inline': outEl.innerHTML=cb+esc(fmtInline(bytes,upper)); break;
    case 'python': outEl.innerHTML=cb+esc(fmtPython(bytes)); break;
    case 'carray': outEl.innerHTML=cb+esc(fmtCArr(bytes)); break;
    case 'disasm':
      if (!llvmMod) { showErr(outEl,'Engine not ready'); return; }
      setTimeout(async()=>{
        try {
          const response=await llvmDisassemble(id,new Uint8Array(bytes),st.selectedArch,st.cpu,st.features,st.syntax==='intel',st.endian,st.immHex,st.printerOptions);
          if(panelState[id]!==st||st.outputGeneration!==outputGeneration||st.asmBytes!==bytes||st.asmTab!=='disasm')return;
          applyDetectedConfig(id,response); applyPrinterCapabilities(id,response); const raw=response.raw;
          if(raw.startsWith('ERROR:')){ showErr(outEl,raw.slice(7).trim()); return; }
          const insns=parseLLVMDisasm(raw,bytes,0);
          outEl.innerHTML=cb+renderListing(insns,new Set(['addr','bytes','ins']));
        } catch(e){
          if(panelState[id]!==st||st.outputGeneration!==outputGeneration)return;
          showErr(outEl,e.message);
        }
      },10); break;
  }
}

// ── Disassemble ───────────────────────────────────────────────────────────────
function doDisassemble(id) {
  if (!llvmMod) return;

  const st=panelState[id];
  if (!st) return;
  const requestGeneration=++st.requestGeneration;
  st.disInsns = null; // Clear previous state early
  st.disBytes = null;

  const raw   = document.getElementById('dis-in-'+id)?.value.trim();
  const sec   = document.getElementById('dis-sec-'+id);
  const outEl = document.getElementById('dis-out-'+id);
  if (!raw||!outEl) { if(sec) sec.style.display='none'; return; }

  let bytes;
  try { bytes=window.WasmMCByteInput.parse(raw); }
  catch(error) { showErr(outEl,error.message); sec.style.display=''; return; }

  let baseAddr=0;
  const rawBaddr=document.getElementById('dis-baddr-'+id).value;
  if(rawBaddr) baseAddr=parseMathBase(rawBaddr);
  if(st.binarySource) baseAddr+=st.binarySource.offset;

  setTimeout(async()=>{
    if(panelState[id]!==st||st.requestGeneration!==requestGeneration)return;
    let result;
    try { result=await llvmDisassemble(id,bytes,st.selectedArch,st.cpu,st.features,st.syntax==='intel',st.endian,st.immHex,st.printerOptions); }
    catch(e){
      if(panelState[id]!==st||st.requestGeneration!==requestGeneration)return;
      showErr(outEl,'EXCEPTION: '+e.message); sec.style.display=''; return;
    }
    if(panelState[id]!==st||st.requestGeneration!==requestGeneration)return;

    applyDetectedConfig(id,result); applyPrinterCapabilities(id,result); result=result.raw;
    if(result.startsWith('ERROR:')){ showErr(outEl,result.slice(7).trim()); sec.style.display=''; return; }

    const insns=parseLLVMDisasm(result,Array.from(bytes),baseAddr);
    if(!insns.length){ showErr(outEl,'No instructions decoded.'); sec.style.display=''; return; }

    st.disInsns=insns; st.disBytes=Array.from(bytes); sec.style.display='';
    const real=insns.filter(i=>!i.pseudo).length, pseudo=insns.filter(i=>i.pseudo).length;
    let stat=real+' instruction'+(real!==1?'s':'')+', '+bytes.length+' byte'+(bytes.length!==1?'s':'');
    if(pseudo) stat+=' ('+pseudo+' unknown byte'+(pseudo!==1?'s':'')+')';
    if(insns.length>MAX_RENDER_ROWS) stat+=' (showing first '+MAX_RENDER_ROWS.toLocaleString()+' rows)';
    document.getElementById('dis-stat-'+id).textContent=stat;
    renderDisOutput(id);
  },10);
}

function parseLLVMDisasm(text, bytes, baseAddr) {
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean);
  const results=[]; let offset=0;
  lines.forEach(line=>{
    const unknownMatch=line.match(/^<unknown byte (0x[0-9a-fA-F]+)>$/);
    if(unknownMatch){
      results.push({address:baseAddr+offset,bytes:[parseInt(unknownMatch[1],16)],mnemonic:'.byte',op_str:unknownMatch[1],pseudo:true});
      offset+=1; return;
    }
    const sizeMatch=line.match(/^SIZE:(\d+)\t(.*)$/);
    let instSize=0, instrText=line;
    if(sizeMatch){
      instSize=parseInt(sizeMatch[1],10);
      instrText=sizeMatch[2];
    }
    const parts=instrText.replace(/^\t/,'').split(/\t/);
    const mnemonic=parts[0]?.trim()||instrText;
    const op_str=parts.slice(1).join(' ').trim();
    const bytesThisInsn=instSize>0?instSize:1;
    const insnBytes=Array.from(bytes).slice(offset,offset+bytesThisInsn);
    results.push({address:baseAddr+offset,bytes:insnBytes,mnemonic,op_str,pseudo:false});
    offset+=bytesThisInsn;
  });
  return results;
}

function renderDisOutput(id) {
  const st=panelState[id], outEl=document.getElementById('dis-out-'+id);
  if(!outEl||!st?.disInsns) return;
  const show=getShow(id), bytes=st.disBytes, upper=st.hexUpper;
  const cb=`<button class="copy-btn" onclick="copyOut('dis-out-${id}')">copy</button>`;
  outEl.className='output-box';
  switch(st.disTab){
    case 'pretty': outEl.innerHTML=cb+renderListing(st.disInsns,show); break;
    case 'hex':    outEl.innerHTML=cb+fmtHexHL(bytes,upper); break;
    case 'inline': outEl.innerHTML=cb+esc(fmtInline(bytes,upper)); break;
    case 'python': outEl.innerHTML=cb+esc(fmtPython(bytes)); break;
    case 'carray': outEl.innerHTML=cb+esc(fmtCArr(bytes)); break;
  }
}

function renderListing(insns, show) {
  if(!insns?.length) return '<span style="color:var(--muted)">No instructions</span>';
  const visible=insns.slice(0,MAX_RENDER_ROWS);
  const rows=visible.map(ins=>{
    const rc=ins.pseudo?' class="row-pseudo"':''; let cols='';
    if(show.has('addr'))  cols+='<td class="col-addr">0x'+ins.address.toString(16).padStart(8,'0')+'</td>';
    if(show.has('bytes')) cols+='<td class="col-bytes">'+ins.bytes.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ')+'</td>';
    if(show.has('ins'))   cols+='<td class="col-mnem">'+esc(ins.mnemonic)+'</td><td class="col-ops">'+esc(ins.op_str)+'</td>';
    return '<tr'+rc+'>'+cols+'</tr>';
  });
  const notice=insns.length>visible.length
    ? '<div class="render-limit-notice">Rendering limited to the first '+visible.length.toLocaleString()+' of '+insns.length.toLocaleString()+' rows. Select a smaller binary range to inspect the remainder.</div>'
    : '';
  return '<table class="dis-table">'+rows.join('')+'</table>'+notice;
}

// ── Live / tabs / close ───────────────────────────────────────────────────────
function scheduleRun(id,type){
  clearTimeout(liveTimers[id]);
  liveTimers[id]=setTimeout(()=>{ if(type==='asm') doAssemble(id); else doDisassemble(id); },350);
}

function initTabsWithToggle(wrap,tabsId,caseToggleTabs,immToggleTabs,onChange,onToggle){
  const tabs=wrap.querySelector('#'+tabsId); if(!tabs) return;
  tabs.addEventListener('click',e=>{
    const btn=e.target.closest('[data-tab]'); if(!btn) return;
    const t=btn.getAttribute('data-tab'), wasActive=btn.classList.contains('active');
    if(wasActive&&caseToggleTabs.includes(t)){
      const pid=tabsId.replace(/^(asm|dis)-tabs-/,'');
      const state=panelState[pid]; if(state){state.hexUpper=!state.hexUpper;onToggle();}
    } else if(wasActive&&immToggleTabs.includes(t)){
      const pid=tabsId.replace(/^(asm|dis)-tabs-/,'');
      const state=panelState[pid]; if(state){state.immHex=!state.immHex;onToggle();}
    } else {
      tabs.querySelectorAll('[data-tab]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); onChange(t);
    }
  });
}

function closePanel(id){
  const wrap=document.getElementById('wrap-'+id); if(!wrap) return;
  const st=panelState[id];
  if(st) backendManager.release(bundleForArch(st.selectedArch),id);
  wrap.classList.add('closing');
  wrap.addEventListener('animationend',()=>wrap.remove(),{once:true});
  setTimeout(()=>{if(wrap.parentNode)wrap.remove();},400);
  delete panelState[id]; clearTimeout(liveTimers[id]); queueSave();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getWrap(id) { return document.getElementById('wrap-'+id); }
function getShow(id) {
  const s=new Set();
  getWrap(id)?.querySelectorAll('[data-show].active').forEach(b=>s.add(b.getAttribute('data-show')));
  return s;
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function fmtHexHL(bytes,upper){ return bytes.map(b=>{ const h=b.toString(16).padStart(2,'0'); const hf=upper?h.toUpperCase():h; return b===0?'<span class="zero-byte">'+hf+'</span>':hf; }).join(' '); }
function fmtInline(bytes,upper){ return bytes.map(b=>'\\x'+(upper?b.toString(16).padStart(2,'0').toUpperCase():b.toString(16).padStart(2,'0'))).join(''); }
function fmtPython(bytes){ return 'b"'+bytes.map(b=>'\\x'+b.toString(16).padStart(2,'0')).join('')+'"'; }
function fmtCArr(bytes){ return '{ '+bytes.map(b=>'0x'+b.toString(16).padStart(2,'0')).join(', ')+' }'; }
function formatAssemblyError(result){
  const fallback='Assembly failed. Check instruction syntax, CPU, and features.';
  let diagnostic=(result?.diagnostics||[]).map(String).filter(Boolean).join('\n').trim();
  if(!diagnostic)return fallback;
  diagnostic=diagnostic.replace(/\x1b\[[0-9;]*m/g,'');
  diagnostic=diagnostic.replace(/^<inline-asm>:\d+:\d+:\s*error:\s*/gm,'');
  diagnostic=diagnostic.replace(/^<inline-asm>:\d+:\d+:\s*warning:\s*/gm,'Warning: ');
  diagnostic=diagnostic.replace(/^<inline-asm>:\d+:\d+:\s*note:\s*/gm,'Note: ');
  return diagnostic.charAt(0).toUpperCase()+diagnostic.slice(1);
}
function showErr(el,msg){ el.className='output-box is-error'; el.innerHTML=`<button class="copy-btn" onclick="copyOut('${el.id}')">copy</button>&#9888; ${esc(msg)}`; }
function copyOut(id){
  const el=document.getElementById(id); if(!el) return;
  const table=el.querySelector('.dis-table'); let text;
  if(table){ text=Array.from(table.querySelectorAll('tr')).map(tr=>Array.from(tr.querySelectorAll('td')).map(td=>td.innerText.trim()).join('  ')).join('\n'); }
  else { const clone=el.cloneNode(true); clone.querySelectorAll('.copy-btn').forEach(x=>x.remove()); text=clone.innerText.trim(); }
  navigator.clipboard.writeText(text).then(()=>{ const btn=el.querySelector('.copy-btn'); if(btn){btn.textContent='copied!';setTimeout(()=>btn.textContent='copy',1500);} });
}
function parseMathBase(e){ if(!e) return 0; try{ const c=e.replace(/[^0-9a-fA-Fx\+\-\*\/\s\(\)]/g,''); if(!c.trim()) return 0; return parseInt(new Function('return ('+c+')')(),10)||0; }catch(e){return 0;} }

// ── Boot ──────────────────────────────────────────────────────────────────────
document.documentElement.setAttribute('data-theme', isDark?'dark':'light');
renderThemeButton();
renderSiteMetadata();
document.getElementById('live-btn').classList.toggle('active', liveMode);
applyLayout();

async function bootWorkspace(){
  let ws=null;
  if(window.location.hash.startsWith('#state=')){
    try{
      const b64=decodeURIComponent(window.location.hash.substring(7));
      ws=new TextDecoder().decode(await unpackData(b64));
      window.history.replaceState(null,null,' ');
    }catch(e){console.error('Hash state load failed',e);}
  }
  if(!ws) ws=savedValue('workspace',null);
  let loaded=false;
  if(ws){ try{ const d=JSON.parse(ws); if(d.panels?.length){d.panels.forEach(p=>addPanel(p.type,p));loaded=true;} }catch(e){console.error('Workspace parse failed',e);} }
  if(!loaded){ addPanel('asm'); addPanel('dis'); }
}

backendManager.loadManifest().then(manifest=>{
  llvmMod=backendManager;
  const version=manifest.llvmVersion||'22';
  renderSiteMetadata(version,manifest.buildYear||String(new Date().getUTCFullYear()));
  document.getElementById('llvm-txt').textContent=`LLVM MC ${version}`;
  setPill('ok',`LLVM MC ${version} · lazy bundles`);
  document.querySelectorAll('.asm-run-btn,.dis-run-btn').forEach(b=>b.disabled=false);
  Object.keys(panelState).forEach(id=>{ if(liveMode) scheduleRun(id,panelState[id].type); });
}).catch(err=>{
  setPill('err','Load failed. Check console.');
  console.error('Backend manifest load error:',err);
});

bootWorkspace();
