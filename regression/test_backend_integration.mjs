#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultWebRoot = existsSync(resolve(projectRoot, "dist/backend-worker.js"))
  ? "dist" : ".";
const root = resolve(projectRoot, process.env.LLVM_WEB_ROOT || defaultWebRoot);
function resolveAsset(name) {
  const exact = resolve(root, name);
  if (existsSync(exact)) return exact;
  const dot = name.lastIndexOf('.');
  const stem = name.slice(0, dot), suffix = name.slice(dot);
  const match = readdirSync(root).find(item => item.startsWith(stem + '.') && item.endsWith(suffix));
  if (!match) throw new Error(`Missing ${name} in ${root}`);
  return resolve(root, match);
}
const manifestName = readdirSync(root).find(name =>
  /^llvm_backend_manifest(?:\.[0-9a-f]+)?\.json$/.test(name));
if (!manifestName) throw new Error(`No backend manifest found in ${root}`);
const manifest = JSON.parse(readFileSync(resolve(root, manifestName), "utf8"));
const bundleSpec = name => ({name, ...manifest.bundles[name]});
globalThis.self = globalThis;
const workerPath = resolveAsset("backend-worker.js");
self.location = { href: pathToFileURL(workerPath).href };
self.importScripts = url => {
  const factory = require(fileURLToPath(url));
  for (const name of ["LLVMEngine", "LLVMEngineMainstream", "LLVMEngineSystems", "LLVMEngineEmbedded"])
    self[name] = factory;
};

let responseHandler = null;
self.postMessage = message => responseHandler?.(message);
await import(pathToFileURL(workerPath));

let nextId = 1;
function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolvePromise, reject) => {
    responseHandler = message => {
      if (message.id !== id) return;
      responseHandler = null;
      message.ok ? resolvePromise(message.result) : reject(new Error(message.error));
    };
    self.onmessage({data: {id, method, params}});
  });
}

await request("initialize", bundleSpec("mainstream"));

const catalog = await request("capabilities", {
  triple: "x86_64-unknown-linux-gnu",
  cpu: "x86-64",
});
assert.equal(catalog.target, "x86-64");
assert(catalog.cpus.length > 100);
assert(catalog.features.some(feature => feature.name === "avx"));

const aarch64Catalog = await request("capabilities", {
  triple: "aarch64-unknown-linux-gnu",
  cpu: "generic",
});
assert(aarch64Catalog.printerOptions.includes("no-aliases"));

const canonicalAarch64 = await request("disassemble", {
  bytes: [0x1f, 0x20, 0x03, 0xd5],
  triple: "aarch64-unknown-linux-gnu",
  cpu: "generic",
  features: "",
  printerOptions: ["no-aliases"],
});
assert.match(canonicalAarch64.raw, /hint\s+#0/);
assert(canonicalAarch64.printerOptionsSupported.includes("no-aliases"));

const rawArmRegisters = await request("disassemble", {
  bytes: [0x0d, 0x00, 0xa0, 0xe1],
  triple: "armv7-unknown-linux-gnueabihf",
  cpu: "",
  features: "",
  printerOptions: ["reg-names-raw"],
});
assert.match(rawArmRegisters.raw, /mov\s+r0, r13/);

const baseline = await request("assemble", {
  source: "crc32b w0, w1, w2",
  triple: "aarch64-unknown-linux-gnu",
  cpu: "generic",
  features: "",
});
assert.equal(baseline.ok, false);

const detected = await request("assembleAuto", {
  source: "crc32b w0, w1, w2",
  triple: "aarch64-unknown-linux-gnu",
  cpu: "generic",
  features: [],
  featureCandidates: ["+crc", "+crypto"],
  cpuCandidates: ["generic", "cortex-a53", "cortex-a76"],
});
assert.equal(detected.ok, true);
assert.equal(detected.changed, true);
assert(detected.features.includes("+crc"));

for (const [source, requiredFeature] of [
  ["aesd v0.16b, v1.16b", "+crypto"],
  ["cas x0, x1, [x2]", "+lse"],
  ["ptrue p0.b", "+sve"],
]) {
  const result = await request("assembleAuto", {
    source,
    triple: "aarch64-unknown-linux-gnu",
    cpu: "generic",
    features: [],
    featureCandidates: ["+crypto", "+lse", "+sve", "+sve2"],
    cpuCandidates: ["generic", "cortex-a35", "carmel", "fujitsu-a64fx"],
  });
  assert.equal(result.ok, true, source);
  assert(result.features.includes(requiredFeature), `${source} did not select ${requiredFeature}`);
}

const invalid = await request("assembleAuto", {
  source: "definitely_not_an_instruction rax",
  triple: "x86_64-unknown-linux-gnu",
  cpu: "",
  features: [],
  featureCandidates: ["+avx", "+avx2", "+avx512f"],
  intelSyntax: true,
});
assert.equal(invalid.ok, false);
assert(invalid.diagnostics.some(line => /(?:invalid|unrecognized) instruction mnemonic/i.test(line)));

const partial = await request("disassemble", {
  bytes: [0xd6, 0xff, 0xc3, 0x00, 0xd1, 0x08, 0xa4],
  triple: "aarch64-unknown-linux-gnu",
  cpu: "",
  features: "",
});
assert.match(partial.raw, /^<unknown byte 0xD6>/m);
assert.match(partial.raw, /SIZE:4\t/);
assert.equal(typeof partial.immHexSupported, "boolean");
if (process.env.REQUIRE_IMM_HEX === "1") assert.equal(partial.immHexSupported, true);

if (partial.immHexSupported) {
  const immediateDecimal = await request("disassemble", {
    bytes: [0x29, 0x68, 0x8c, 0xd2],
    triple: "aarch64-unknown-linux-gnu",
    cpu: "generic",
    features: "",
    immHex: false,
  });
  const immediateHex = await request("disassemble", {
    bytes: [0x29, 0x68, 0x8c, 0xd2],
    triple: "aarch64-unknown-linux-gnu",
    cpu: "generic",
    features: "",
    immHex: true,
  });
  assert.match(immediateDecimal.raw, /#25409/);
  assert.match(immediateHex.raw, /#0x6341/i);
}

await request("initialize", bundleSpec("systems"));
const riscvCatalog = await request("capabilities", {
  triple: "riscv64-unknown-elf",
  cpu: "",
});
assert(riscvCatalog.printerOptions.includes("no-aliases"));
assert(riscvCatalog.printerOptions.includes("numeric"));

const numericRiscv = await request("disassemble", {
  bytes: [0x13, 0x85, 0xc5, 0x02],
  triple: "riscv64-unknown-elf",
  cpu: "",
  features: "",
  printerOptions: ["numeric"],
});
assert.match(numericRiscv.raw, /addi\s+x10, x11, 44/);

const riscvDetected = await request("assembleAuto", {
  source: "mul a0, a1, a2",
  triple: "riscv64-unknown-elf",
  cpu: "",
  features: [],
  // +e is incompatible with RV64. A catalog-wide closure is therefore not a
  // valid probe, but the individual +m probe must still succeed.
  featureCandidates: ["+e", "+m", "+a", "+f", "+d", "+c", "+v", "+zicsr"],
  cpuCandidates: ["", "generic-rv64", "sifive-u74"],
});
assert.equal(riscvDetected.ok, true);
assert(riscvDetected.features.includes("+m"));

const mips64DspDetected = await request("assembleAuto", {
  source: "addu.qb $2, $3, $4",
  triple: "mips64el-unknown-linux-gnu",
  cpu: "",
  features: [],
  featureCandidates: ["+msa", "+dsp"],
  cpuCandidates: ["", "mips64", "mips64r2", "mips64r6"],
});
assert.equal(mips64DspDetected.ok, true);
assert(mips64DspDetected.features.includes("+dsp"));

await request("initialize", bundleSpec("embedded"));
const hexagonDetected=await request("disassembleAuto",{
  bytes:[0x40,0xc1,0x02,0x1c],triple:"hexagon-unknown-linux-musl",cpu:"hexagonv60",
  features:[],featureCandidates:["+hvx","+hvxv66","+audio"],cpuCandidates:["hexagonv60","hexagonv66"]
});
assert.equal(hexagonDetected.ok,true);
assert(hexagonDetected.features.includes("+hvxv66")||hexagonDetected.features.includes("+hvx"));

console.log("Backend integration tests passed");
