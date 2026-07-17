'use strict';

class LLVMBackendManager {
  constructor({manifestUrl = 'llvm_backend_manifest.json', workerUrl = 'backend-worker.js', idleMs = 60000} = {}) {
    this.manifestUrl = manifestUrl;
    this.workerUrl = workerUrl;
    this.idleMs = idleMs;
    this.manifest = null;
    this.backends = new Map();
    this.nextRequestId = 1;
    this.listeners = new Set();
  }

  async loadManifest() {
    if (this.manifest) return this.manifest;
    const response = await fetch(this.manifestUrl, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`Failed to load backend manifest: ${response.status}`);
    this.manifest = await response.json();
    return this.manifest;
  }

  onStatus(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  notify() { const status = this.status(); for (const listener of this.listeners) listener(status); }

  async ensure(bundleName) {
    const manifest = await this.loadManifest();
    const existing = this.backends.get(bundleName);
    if (existing) {
      clearTimeout(existing.timer);
      existing.timer = null;
      await existing.ready;
      return existing;
    }
    const spec = manifest.bundles[bundleName];
    if (!spec) throw new Error(`Unknown backend bundle: ${bundleName}`);
    const worker = new Worker(this.workerUrl);
    const backend = {name: bundleName, spec, worker, refs: new Set(), pending: new Map(), timer: null, heapBytes: 0, ready: null};
    worker.onmessage = event => {
      const pending = backend.pending.get(event.data.id);
      if (!pending) return;
      backend.pending.delete(event.data.id);
      event.data.ok ? pending.resolve(event.data.result) : pending.reject(new Error(event.data.error));
    };
    worker.onerror = error => {
      const failure = error instanceof Error ? error : new Error(error?.message || 'Backend worker failed');
      for (const pending of backend.pending.values()) pending.reject(failure);
      backend.pending.clear();
      if (this.backends.get(bundleName) === backend) this.backends.delete(bundleName);
      worker.terminate();
      this.notify();
    };
    this.backends.set(bundleName, backend);
    backend.ready = this.callBackend(backend, 'initialize', {...spec, name: bundleName})
      .then(initialized => {
        backend.heapBytes = initialized.heapBytes;
        this.notify();
      })
      .catch(error => {
        if (this.backends.get(bundleName) === backend) this.backends.delete(bundleName);
        worker.terminate();
        this.notify();
        throw error;
      });
    await backend.ready;
    return backend;
  }

  callBackend(backend, method, params) {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      backend.pending.set(id, {resolve, reject});
      backend.worker.postMessage({id, method, params});
    });
  }

  async acquire(bundleName, owner) {
    const backend = await this.ensure(bundleName);
    backend.refs.add(owner);
    this.notify();
    return backend;
  }

  release(bundleName, owner) {
    const backend = this.backends.get(bundleName);
    if (!backend) return;
    backend.refs.delete(owner);
    if (!backend.refs.size && !backend.timer) {
      backend.timer = setTimeout(() => this.unload(bundleName, false), this.idleMs);
    }
    this.notify();
  }

  async request(bundleName, method, params, owner = null) {
    const backend = owner ? await this.acquire(bundleName, owner) : await this.ensure(bundleName);
    const result = await this.callBackend(backend, method, params);
    if (method === 'memory') backend.heapBytes = result.heapBytes;
    return result;
  }

  unload(bundleName, force = false) {
    const backend = this.backends.get(bundleName);
    if (!backend || (!force && backend.refs.size)) return false;
    clearTimeout(backend.timer);
    backend.worker.terminate();
    for (const pending of backend.pending.values()) pending.reject(new Error('Backend unloaded'));
    this.backends.delete(bundleName);
    this.notify();
    return true;
  }

  unloadUnused() {
    for (const [name, backend] of this.backends) if (!backend.refs.size) this.unload(name, true);
  }

  status() {
    return [...this.backends.values()].map(backend => ({
      name: backend.name,
      refs: backend.refs.size,
      idle: backend.refs.size === 0,
      heapBytes: backend.heapBytes,
      js: backend.spec.js,
      wasm: backend.spec.wasm,
    }));
  }
}

window.LLVMBackendManager = LLVMBackendManager;
