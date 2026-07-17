#!/usr/bin/env python3
"""Check security and stale-request guards in the browser frontend."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
manager = (ROOT / "web" / "backend-manager.js").read_text(encoding="utf-8")

assert ".replace(/\"/g,'&quot;')" in app
assert ".replace(/'/g,'&#39;')" in app
assert "requestGeneration:0" in app
assert app.count("st.requestGeneration!==requestGeneration") >= 6
assert "st.outputGeneration!==outputGeneration" in app
assert "await existing.ready" in manager
assert "backend.ready = this.callBackend" in manager
assert "this.backends.delete(bundleName)" in manager

print("Frontend hardening tests passed")
