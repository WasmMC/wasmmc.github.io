#!/usr/bin/env node

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../web/app.js",import.meta.url),"utf8");
const definition=source.match(/function esc\(s\)\{[^}]+\}/)?.[0];
assert(definition,"esc() definition not found");
const context={};
vm.runInNewContext(`${definition}; globalThis.escapeForTest=esc;`,context);

const payload=`x" autofocus onfocus="alert('shared link')" <tag> &`;
assert.equal(
  context.escapeForTest(payload),
  "x&quot; autofocus onfocus=&quot;alert(&#39;shared link&#39;)&quot; &lt;tag&gt; &amp;",
);

console.log("Frontend escaping tests passed");
