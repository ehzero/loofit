#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Sync the full widget configuration into an existing generated project. The
# explicit build mode prevents an inherited APP_ONLY value from changing the
# native targets or entitlements unexpectedly.
CI=1 LOOFIT_APP_ONLY=0 npx expo prebuild \
  --platform ios \
  --no-install \
  --no-clean
