#!/usr/bin/env node
// Persistent newline-delimited JSON adapter for llvm_backend.js.

import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const backendPath = resolve(process.argv[2] || resolve(projectRoot, "llvm_backend.js"));
const backendDirectory = dirname(backendPath);
const LLVMEngine = require(backendPath);
const pairedWasmPath = backendPath.replace(/\.js$/, ".wasm");
let diagnostics = [];
const Module = await LLVMEngine({
  locateFile: (name) => name.endsWith(".wasm") && existsSync(pairedWasmPath)
    ? pairedWasmPath : resolve(backendDirectory, name),
  print: (text) => diagnostics.push(String(text)),
  printErr: (text) => diagnostics.push(String(text)),
});
diagnostics = [];

function invoke(name, argTypes, args) {
  let resultPtr = 0;
  try {
    resultPtr = Module.ccall(name, "number", argTypes, args);
    return Module.UTF8ToString(resultPtr);
  } finally {
    if (resultPtr) Module.ccall("free_result", null, ["number"], [resultPtr]);
  }
}

function assemble(request) {
  const text = invoke(
    "assemble_string",
    ["string", "string", "string", "string", "number", "number"],
    [request.source, request.triple, request.cpu || "", request.features || "",
     request.intel_syntax ? 1 : 0, request.relax ? 1 : 0],
  );
  const success = !text.startsWith("ERROR:");
  const payload = text.startsWith("WARN:") ? text.slice(text.indexOf(":") + 1) : text;
  const tokens = payload.trim().split(/\s+/).filter(Boolean);
  const bytes = tokens.every((token) => /^[0-9a-fA-F]{2}$/.test(token))
    ? tokens.join("").toLowerCase() : "";
  return { success, illegal: !success, bytes, disassembly: [], raw: text };
}

function disassemble(request) {
  const bytes = Buffer.from(request.bytes, "hex");
  const extendedV2 = typeof Module._disassemble_bytes_ex2 === "function";
  if (request.printer_options && !extendedV2) {
    throw new Error("WASM backend does not export disassemble_bytes_ex2");
  }
  let bytePtr = 0;
  let text;
  try {
    if (bytes.length) {
      bytePtr = Module._malloc(bytes.length);
      Module.HEAPU8.set(bytes, bytePtr);
    }
    text = invoke(
      extendedV2 ? "disassemble_bytes_ex2" : "disassemble_bytes",
      extendedV2
        ? ["number", "number", "string", "string", "string", "number", "number", "string"]
        : ["number", "number", "string", "string", "string", "number"],
      [bytePtr, bytes.length, request.triple, request.cpu || "",
       request.features || "", request.intel_syntax ? 1 : 0,
       ...(extendedV2 ? [0, request.printer_options || ""] : [])],
    );
  } finally {
    if (bytePtr) Module._free(bytePtr);
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const illegal = lines.some((line) => line.startsWith("<unknown byte")) || text.startsWith("ERROR:");
  const disassembly = lines
    .filter((line) => line.startsWith("SIZE:"))
    .map((line) => line.split("\t").slice(1).filter(Boolean).join(" ").trim().replace(/\s+/g, " "));
  return { success: !illegal, illegal, bytes: "", disassembly, raw: text };
}

function handle(request) {
  if (!request || !["assemble", "disassemble"].includes(request.operation)) {
    throw new Error("operation must be 'assemble' or 'disassemble'");
  }
  diagnostics = [];
  const result = request.operation === "assemble" ? assemble(request) : disassemble(request);
  return { ...result, backend: "wasm", stderr: diagnostics.join("\n") };
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  try {
    process.stdout.write(`${JSON.stringify(handle(JSON.parse(line)))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ protocol_error: String(error?.stack || error) })}\n`);
  }
}
