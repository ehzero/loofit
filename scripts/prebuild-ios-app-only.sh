#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Expo prebuild is clean by default. Recreating ios/ is intentional here so a
# previously generated Widget Extension cannot leak into an app-only build.
CI=1 LOOFIT_APP_ONLY=1 npx expo prebuild \
  --platform ios \
  --no-install
