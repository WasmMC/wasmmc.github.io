#!/usr/bin/env node

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/byte-input.js',import.meta.url),'utf8');
const context={Uint8Array};
vm.runInNewContext(source,context);
const byteInput=context.WasmMCByteInput;
const parse=value=>Array.from(byteInput.parse(value));

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
  assert.throws(()=>byteInput.parse(malformed),undefined,malformed);
}

assert.equal(byteInput.MAX_INPUT_BYTES,64*1024);
assert.equal(byteInput.MAX_FILE_BYTES,500*1024);
assert.equal(byteInput.DEFAULT_FILE_WINDOW_BYTES,16*1024);
assert.equal(byteInput.parseWindowValue('4096','Offset'),4096);
assert.equal(byteInput.parseWindowValue('0x1000','Offset'),4096);
assert.deepEqual(
  {...byteInput.clampFileWindow(100000,90000,20000)},
  {offset:90000,length:10000,end:100000},
);
assert.deepEqual(
  {...byteInput.clampFileWindow(100000,0,999999)},
  {offset:0,length:65536,end:65536},
);
assert.deepEqual(
  {...byteInput.clampFileWindow(100000,999999,999999)},
  {offset:99999,length:1,end:100000},
);
assert.throws(()=>byteInput.parseWindowValue('-1','Offset'));
assert.throws(()=>byteInput.clampFileWindow(0,0,1));
assert.throws(()=>byteInput.clampFileWindow(100,0,0));
assert.throws(()=>byteInput.parse('00'.repeat(byteInput.MAX_INPUT_BYTES+1)));

console.log('Byte input parser tests passed');
