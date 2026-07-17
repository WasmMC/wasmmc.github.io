#pragma once

// Implemented by exactly one bundle-specific translation unit linked into each
// WASM artifact. This keeps target registration out of the shared backend API.
void initialize_bundle_targets();
