'use strict';

// One worker owns one Emscripten module. Terminating the worker is the cleanup
// boundary for that module's linear memory and compiled WebAssembly instance.
let llvmModule = null;
let bundle = null;
let diagnostics = [];
const capabilityCache = new Map();

function emitDiagnostic(text) { diagnostics.push(String(text)); }

function callResult(name, argTypes, args) {
  let ptr = 0;
  try {
    ptr = llvmModule.ccall(name, 'number', argTypes, args);
    return llvmModule.UTF8ToString(ptr);
  } finally {
    if (ptr) llvmModule.ccall('free_result', null, ['number'], [ptr]);
  }
}

function assembleRaw(options) {
  diagnostics = [];
  const raw = callResult('assemble_string',
    ['string', 'string', 'string', 'string', 'number', 'number'],
    [options.source, options.triple, options.cpu || '', options.features || '',
     options.intelSyntax ? 1 : 0, options.relax ? 1 : 0]);
  return {ok: !raw.startsWith('ERROR:'), raw, diagnostics: diagnostics.slice()};
}

function disassembleRaw(options) {
  diagnostics = [];
  const bytes = new Uint8Array(options.bytes);
  const extendedV2 = typeof llvmModule._disassemble_bytes_ex2 === 'function';
  const extended = extendedV2 || typeof llvmModule._disassemble_bytes_ex === 'function';
  const functionName = extendedV2 ? 'disassemble_bytes_ex2'
    : extended ? 'disassemble_bytes_ex' : 'disassemble_bytes';
  let bytePtr = 0;
  try {
    if (bytes.length) {
      bytePtr = llvmModule._malloc(bytes.length);
      llvmModule.HEAPU8.set(bytes, bytePtr);
    }
    const raw = callResult(functionName,
      extendedV2
        ? ['number', 'number', 'string', 'string', 'string', 'number', 'number', 'string']
        : extended
          ? ['number', 'number', 'string', 'string', 'string', 'number', 'number']
          : ['number', 'number', 'string', 'string', 'string', 'number'],
      [bytePtr, bytes.length, options.triple, options.cpu || '',
       options.features || '', options.intelSyntax ? 1 : 0,
       ...(extended ? [options.immHex ? 1 : 0] : []),
       ...(extendedV2 ? [[...new Set(options.printerOptions || [])].join(',')] : [])]);
    const printerOptionsSupported = extendedV2
      ? (capabilities(options.triple, options.cpu || '').printerOptions || []) : [];
    return {ok: !raw.startsWith('ERROR:'), raw, diagnostics: diagnostics.slice(),
      immHexSupported: extended, printerOptionsSupported};
  } finally {
    if (bytePtr) llvmModule._free(bytePtr);
  }
}

function capabilities(triple, cpu = '') {
  const key = `${triple}\0${cpu}`;
  if (capabilityCache.has(key)) return capabilityCache.get(key);
  const raw = callResult('get_target_capabilities', ['string', 'string'], [triple, cpu]);
  if (raw.startsWith('ERROR:')) throw new Error(raw.slice(6).trim());
  const result = JSON.parse(raw);
  capabilityCache.set(key, result);
  return result;
}

function featureString(features) {
  return [...new Set(features || [])].sort().join(',');
}

function safeAssemble(options) {
  try { return assembleRaw(options); }
  catch (error) { return {ok:false,raw:'ERROR: Probe configuration failed.',probeError:String(error?.stack||error)}; }
}

function enabledFeatureCount(triple, cpu) {
  return capabilities(triple, cpu).features.reduce((n, feature) => n + (feature.enabled ? 1 : 0), 0);
}

function orderedCpus(triple, preferred = []) {
  const catalog = capabilities(triple, '');
  const all = [...new Set(['', ...preferred, ...catalog.cpus])];
  return all.map((cpu, index) => ({cpu, index, weight: enabledFeatureCount(triple, cpu)}))
    .sort((a, b) => a.weight - b.weight || a.index - b.index)
    .map(item => item.cpu);
}

function minimizeFeatures(options, cpu, features, pinned = []) {
  let selected = [...new Set(features)];
  const keep = new Set(pinned);
  // Candidate lists are ordered from baseline features to later supersets.
  // Remove from the end so an implied feature such as SVE2 does not displace
  // the smaller explicit requirement, SVE.
  for (const feature of [...selected].reverse()) {
    if (keep.has(feature)) continue;
    const trial = selected.filter(item => item !== feature);
    if (safeAssemble({...options, cpu, features: featureString(trial)}).ok) selected = trial;
  }
  return selected;
}

function assembleAuto(options) {
  const currentFeatures = options.features || [];
  const baseline = safeAssemble({...options, features: featureString(currentFeatures)});
  if (baseline.ok) return {...baseline, changed: false, cpu: options.cpu || '', features: currentFeatures};

  const candidates = [...new Set(options.featureCandidates || [])]
    .filter(feature => !currentFeatures.includes(feature));
  if (candidates.length) {
    // Full catalogs contain mutually incompatible flags. Try one addition at
    // a time first; this also gives stable preference to the curated features
    // that appear at the beginning of each target's list.
    for (const feature of candidates) {
      const trial = [...currentFeatures, feature];
      const result = safeAssemble({...options, features: featureString(trial)});
      if (result.ok)
        return {...result, changed: true, cpu: options.cpu || '', features: trial};
    }

    // Prefer an explicit feature closure on the user's CPU before silently
    // upgrading the CPU to one which implies that feature.
    const closure=[...currentFeatures,...candidates];
    const result=safeAssemble({...options,features:featureString(closure)});
    if(result.ok){
      const minimal=minimizeFeatures(options,options.cpu||'',closure,currentFeatures);
      const finalResult=safeAssemble({...options,features:featureString(minimal)});
      return {...finalResult,changed:true,cpu:options.cpu||'',features:minimal};
    }
  }

  const cpus = orderedCpus(options.triple, options.cpuCandidates || []);
  for (const cpu of cpus) {
    const result = safeAssemble({...options, cpu, features: featureString(currentFeatures)});
    if (result.ok) return {...result, changed: true, cpu, features: currentFeatures};
  }

  if (candidates.length) {
    for (const cpu of cpus) {
      for (const feature of candidates) {
        const trial=[...currentFeatures,feature];
        const result=safeAssemble({...options,cpu,features:featureString(trial)});
        if(result.ok)
          return {...result,changed:true,cpu,features:trial};
      }
      const closure=[...currentFeatures,...candidates];
      const result = safeAssemble({...options, cpu, features: featureString(closure)});
      if (!result.ok) continue;
      const minimal = minimizeFeatures(options, cpu, closure, currentFeatures);
      const finalResult = safeAssemble({...options, cpu, features: featureString(minimal)});
      return {...finalResult, changed: true, cpu, features: minimal};
    }
  }
  return {...baseline, changed: false, cpu: options.cpu || '', features: currentFeatures};
}

function decodeScore(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const unknown = lines.filter(line => line.startsWith('<unknown byte ')).length;
  const decodedBytes = lines.reduce((total, line) => {
    const match = line.match(/^SIZE:(\d+)\t/);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
  return {unknown, decodedBytes};
}

function disassembleAuto(options) {
  const currentFeatures = options.features || [];
  const baseline = disassembleRaw({...options, features: featureString(currentFeatures)});
  let best = {...baseline, changed: false, cpu: options.cpu || '', features: currentFeatures};
  let bestScore = decodeScore(baseline.raw);
  if (!bestScore.unknown) {
    const source=baseline.raw.split(/\r?\n/).filter(line=>line.startsWith('SIZE:'))
      .map(line=>line.replace(/^SIZE:\d+\t+/,'').trim()).filter(Boolean).join('\n');
    if(source){
      const requirements=assembleAuto({...options,source});
      if(requirements.ok&&requirements.changed)
        return {...best,changed:true,cpu:requirements.cpu,features:requirements.features,score:bestScore};
    }
    return best;
  }

  const cpus = orderedCpus(options.triple, options.cpuCandidates || []);
  const featureSets = [currentFeatures];
  if ((options.featureCandidates || []).length) featureSets.push(options.featureCandidates);
  for (const cpu of cpus) {
    for (const features of featureSets) {
      const result = disassembleRaw({...options, cpu, features: featureString(features)});
      const score = decodeScore(result.raw);
      if (score.decodedBytes > bestScore.decodedBytes ||
          (score.decodedBytes === bestScore.decodedBytes && score.unknown < bestScore.unknown)) {
        best = {...result, changed: true, cpu, features: [...features]};
        bestScore = score;
      }
    }
  }
  return {...best, score: bestScore};
}

async function initialize(spec) {
  bundle = spec;
  importScripts(new URL(spec.js, self.location.href).href);
  const factory = self[spec.factory];
  if (typeof factory !== 'function') throw new Error(`Missing factory ${spec.factory}`);
  llvmModule = await factory({
    locateFile: name => new URL(
      name.endsWith('.wasm') && spec.wasm ? spec.wasm : name,
      new URL(spec.js, self.location.href),
    ).href,
    print: emitDiagnostic,
    printErr: emitDiagnostic,
  });
  return {bundle: spec.name, heapBytes: llvmModule.HEAPU8.buffer.byteLength};
}

self.onmessage = async event => {
  const {id, method, params = {}} = event.data;
  try {
    let result;
    if (method === 'initialize') result = await initialize(params);
    else if (!llvmModule) throw new Error('Backend worker is not initialized');
    else if (method === 'assemble') result = assembleRaw(params);
    else if (method === 'disassemble') result = disassembleRaw(params);
    else if (method === 'assembleAuto') result = assembleAuto(params);
    else if (method === 'disassembleAuto') result = disassembleAuto(params);
    else if (method === 'capabilities') result = capabilities(params.triple, params.cpu || '');
    else if (method === 'memory') result = {heapBytes: llvmModule.HEAPU8.buffer.byteLength};
    else throw new Error(`Unknown backend method: ${method}`);
    self.postMessage({id, ok: true, result});
  } catch (error) {
    self.postMessage({id, ok: false, error: String(error?.stack || error)});
  }
};
