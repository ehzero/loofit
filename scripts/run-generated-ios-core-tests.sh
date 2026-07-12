#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d ios/app.xcworkspace ]]; then
  echo "Generated iOS workspace is missing. Prebuild with LOOFIT_CORE_TESTS=1 and install pods first." >&2
  exit 1
fi

SIMULATOR_ID="$(
  xcrun simctl list devices available |
    awk -F '[()]' '/iPhone/ { print $2; exit }'
)"

if [[ -z "$SIMULATOR_ID" ]]; then
  echo "No available iPhone simulator was found." >&2
  exit 1
fi

export LOOFIT_COMMAND_SCENARIOS_PATH="$ROOT_DIR/contracts/workout-command-scenarios.json"
XCODEBUILD_ARGS=(
  -workspace ios/app.xcworkspace
  -scheme LoofitWorkoutCore-Unit-Tests
  -sdk iphonesimulator
  -destination "id=$SIMULATOR_ID"
)
if [[ -n "${LOOFIT_TEST_DERIVED_DATA:-}" ]]; then
  XCODEBUILD_ARGS+=( -derivedDataPath "$LOOFIT_TEST_DERIVED_DATA" )
fi
xcodebuild "${XCODEBUILD_ARGS[@]}" test
