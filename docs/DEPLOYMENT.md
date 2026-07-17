# GitHub Pages deployment

WasmMC publishes the exact split-bundle site artifact that passed the native
LLVM regression suite. The deployment job does not rebuild, alter, or select a
different copy of the website.

## New public repository

1. Create the repository without generated `build`, `dist`, `full-dist`, or
   `reports` directories.
2. Make `main` the default branch.
3. Open **Settings**, then **Pages**. Under **Build and deployment**, set
   **Source** to **GitHub Actions**.
4. Open **Settings**, then **Actions**, then **General**. Ensure the repository
   permits the actions used by the workflows. WasmMC uses GitHub-maintained
   actions plus `emscripten-core/setup-emsdk` and
   `peter-evans/create-pull-request`.
5. Push the source tree and workflows.

If GitHub does not expose Pages settings before the repository has a default
branch, push the source tree without `.github/workflows`, configure Pages, then
push the workflows. This also prevents the first deployment from racing the
repository configuration.

No deployment secret is required. GitHub supplies `GITHUB_TOKEN` and an OpenID
Connect identity to the deployment job.

## Deployment gate

On a push to public `main`, the workflow:

1. Builds the split and full WebAssembly backends.
2. Builds native `llvm-mc` from the same pinned LLVM release.
3. Runs the complete full-bundle, split-bundle, and feature-enforcement suites.
4. Downloads the already verified site artifact.
5. Publishes that artifact through the `github-pages` environment.

Pull requests never deploy. Failed, skipped, or incomplete regression jobs
cannot reach the deployment job. The optional full backend remains a workflow
artifact and is not published to the website.

## Private repository validation

The deployment job is skipped in private repositories by default. This allows
the existing private repository to validate builds, tests, staging, checksums,
and artifacts without publishing a site.

To test private Pages on a plan that supports it, create a repository Actions
variable named `ENABLE_PRIVATE_PAGES` with the value `true`, then set the Pages
source to GitHub Actions. Remove or disable that variable when private
deployment is no longer wanted.

## Recommended repository protection

After the first successful deployment, review the automatically created
`github-pages` environment and restrict deployment branches to `main`.

For normal development, protect `main` and require the **Build and verify
WasmMC** workflow before merging pull requests. The workflow-level deployment
condition remains an independent safeguard.

The scheduled LLVM release workflow creates update pull requests. If that
automation is wanted, enable **Allow GitHub Actions to create and approve pull
requests** under the repository Actions settings. Merging an update remains a
manual decision and requires the complete build and regression workflow to
pass.

## Custom domains

Configure a custom domain in the repository Pages settings. Do not add a
hardcoded `CNAME` file unless a specific domain has been selected. All WasmMC
asset paths are relative, so the default project URL works without source
changes.
