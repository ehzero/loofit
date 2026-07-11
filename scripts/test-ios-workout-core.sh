#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

restore_production_pods() {
  local status=$?
  trap - EXIT
  echo "Restoring the production LoofitWorkoutCore pod declaration..."
  LOOFIT_CORE_TESTS=0 CI=1 npx expo prebuild --platform ios --no-install >/dev/null || true
  npx pod-install >/dev/null || true
  exit "$status"
}
trap restore_production_pods EXIT

LOOFIT_CORE_TESTS=1 CI=1 npx expo prebuild --platform ios --no-install
npx pod-install

SIMULATOR_ID="$(
  xcrun simctl list devices available |
    awk -F '[()]' '/iPhone/ { print $2; exit }'
)"

if [[ -z "$SIMULATOR_ID" ]]; then
  echo "No available iPhone simulator was found." >&2
  exit 1
fi

xcodebuild \
  -workspace ios/app.xcworkspace \
  -scheme LoofitWorkoutCore-Unit-Tests \
  -sdk iphonesimulator \
  -destination "id=$SIMULATOR_ID" \
  test
