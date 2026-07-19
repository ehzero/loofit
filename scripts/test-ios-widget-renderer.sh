#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASELINE_SIMULATOR_NAME="${LOOFIT_IOS_WIDGET_SIMULATOR_NAME:-iPhone 17 Pro}"
BASELINE_RUNTIME="${LOOFIT_IOS_WIDGET_RUNTIME:-iOS 26.1}"
SIMULATOR_ID="${LOOFIT_IOS_WIDGET_SIMULATOR_ID:-}"
if [[ -z "$SIMULATOR_ID" ]]; then
  SIMULATOR_ID="$(
    xcrun simctl list devices available |
      awk -F '[()]' -v runtime="-- $BASELINE_RUNTIME --" -v name="$BASELINE_SIMULATOR_NAME" '
        $0 == runtime { in_runtime = 1; next }
        /^-- / { in_runtime = 0 }
        in_runtime && index($0, name " (") { print $2; exit }
      '
  )"
fi
if [[ -z "$SIMULATOR_ID" ]]; then
  echo "The iOS widget visual baseline simulator was not found: $BASELINE_SIMULATOR_NAME / $BASELINE_RUNTIME" >&2
  echo "Set LOOFIT_IOS_WIDGET_SIMULATOR_ID to an equivalent installed simulator if needed." >&2
  exit 1
fi

set +e
xcodebuild \
  -quiet \
  -scheme LoofitWidgetVisualTests-Package \
  -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  test
TEST_STATUS=$?
set -e

SIMULATOR_REPORT_DIRECTORY="$HOME/Library/Developer/CoreSimulator/Devices/$SIMULATOR_ID/data/tmp/loofit-widget-goldens-ios"
REPORT_DIRECTORY="$ROOT_DIR/build/reports/loofit-widget-goldens-ios"
if [[ -d "$SIMULATOR_REPORT_DIRECTORY" ]]; then
  mkdir -p "$REPORT_DIRECTORY"
  cp -R "$SIMULATOR_REPORT_DIRECTORY/." "$REPORT_DIRECTORY/"
  echo "iOS widget visual artifacts: $REPORT_DIRECTORY"
fi

exit "$TEST_STATUS"
