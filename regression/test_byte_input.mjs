#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/byte-input.js',import.meta.url),'utf8');
const context={Uint8Array};
vm.runInNewContext(source,context);
const parse=value=>Array.from(context.WasmMCByteInput.parse(value));

const expected=[0x90,0xc3,0x00,0xff];
assert.deepEqual(parse('90 C3 00 FF'),expected);
assert.deepEqual(parse('90c300ff'),expected);
assert.deepEqual(parse('90:c3:00:ff'),expected);
assert.deepEqual(parse('0x90, 0xc3, 0x00, 0xff'),expected);
assert.deepEqual(parse('{ 0x90, 0xc3, 0x00, 0xff }'),expected);
assert.deepEqual(parse('const uint8_t code[] = { 0x90, 0xc3, 0x00, 0xff };'),expected);
assert.deepEqual(parse('\\x90\\xc3\\x00\\xff'),expected);
assert.deepEqual(parse('b"\\x90\\xc3\\x00\\xff"'),expected);

for(const malformed of [
  '', '9', '0x100', '0x90, nope', '\\x9', '\\x90 00',
  'b"\\x90" trailing', '{ 0x90, }', 'unsigned char code[] = { 0x90, bad };',
]) {
  assert.throws(()=>context.WasmMCByteInput.parse(malformed),undefined,malformed);
}

console.log('Byte input parser tests passed');
