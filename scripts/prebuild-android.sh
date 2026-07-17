#!/usr/bin/env bash

set -euo pipefail

LOOFIT_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LOOFIT_ROOT_DIR"

CI=1 npx expo prebuild \
  --platform android \
  --no-install \
  --clean
