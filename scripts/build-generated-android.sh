#!/usr/bin/env bash

set -euo pipefail

LOOFIT_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LOOFIT_ROOT_DIR"

if [[ ! -f "android/gradlew" || ! -f "android/app/build.gradle" ]]; then
  echo "Generated android/ project is missing." >&2
  echo "Run npm run android:prebuild first." >&2
  exit 1
fi

exec npx expo run:android "$@"
