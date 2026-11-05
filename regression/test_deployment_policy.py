#!/usr/bin/env python3
"""Check that Pages publishes only the verified main-branch site artifact."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github" / "workflows" / "build.yml").read_text(encoding="utf-8")

required = (
    "deploy_pages:",
    "needs: [build_wasm, regression]",
    "github.ref == 'refs/heads/main'",
    "github.event.repository.private == false",
    "vars.ENABLE_PRIVATE_PAGES == 'true'",
    "pages: write",
    "id-token: write",
    "name: github-pages",
    "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6",
    "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5",
    "include-hidden-files: true",
    "actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5",
    "path: dist",
)
for text in required:
    assert text in workflow, f"missing deployment policy: {text}"

deploy_section = workflow.split("\n  deploy_pages:\n", 1)[1]
assert "pull_request" not in deploy_section
assert "full-dist" not in deploy_section
assert "needs.build_wasm.outputs.llvm-version" in deploy_section

print("Deployment policy tests passed")
