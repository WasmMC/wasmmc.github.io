#!/usr/bin/env python3
"""Check security, layout, and stale-request guards in the browser frontend."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
app = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
manager = (ROOT / "web" / "backend-manager.js").read_text(encoding="utf-8")
index = (ROOT / "web" / "index.html").read_text(encoding="utf-8")


def css_declarations(selector):
    match = re.search(r"^" + re.escape(selector) + r"\{([^}]*)\}", index, re.MULTILINE)
    assert match is not None, f"Missing CSS rule for {selector}"
    declarations = {}
    for declaration in match.group(1).split(";"):
        if ":" not in declaration:
            continue
        name, value = declaration.split(":", 1)
        declarations[name.strip()] = value.strip()
    return declarations

assert ".replace(/\"/g,'&quot;')" in app
assert ".replace(/'/g,'&#39;')" in app
assert "requestGeneration:0" in app
assert app.count("st.requestGeneration!==requestGeneration") >= 6
assert "st.outputGeneration!==outputGeneration" in app
assert "const MAX_RENDER_ROWS=10000" in app
assert "insns.slice(0,MAX_RENDER_ROWS)" in app
assert "clampFileWindow(source.bytes.length,offset,length)" in app
assert "if(st.binarySource) baseAddr+=st.binarySource.offset" in app
assert "wrap.querySelector(`#dis-baddr-${id}`)" in app
assert "await existing.ready" in manager
assert "backend.ready = this.callBackend" in manager
assert "this.backends.delete(bundleName)" in manager

panel_grid = css_declarations(".panel-grid")
panel_wrap = css_declarations(".panel-wrap")
panel = css_declarations(".panel")
panel_body = css_declarations(".panel-body")
run_action = css_declarations(".run-action")
run_button = css_declarations(".run-btn")

assert panel_grid["align-items"] == "stretch"
assert panel_wrap["display"] == "flex"
assert panel["display"] == "flex"
assert panel["flex-direction"] == "column"
assert panel_body["display"] == "flex"
assert panel_body["flex"] == "1 1 auto"
assert panel_body["flex-direction"] == "column"
assert run_action["margin-top"] == "auto"
assert run_action["padding-top"] == "12px"
assert run_button["margin-top"] == "0"
assert app.count('<div class="run-action">') == 2

print("Frontend hardening tests passed")
