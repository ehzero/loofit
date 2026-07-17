#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INFO_PLIST="ios/app/Info.plist"
PROJECT_FILE="ios/app.xcodeproj/project.pbxproj"
NATIVE_LANGUAGE='ko'

if [[ ! -f "$INFO_PLIST" || ! -f "$PROJECT_FILE" || ! -f ios/Podfile ]]; then
  echo "Generated app-only iOS project is missing." >&2
  exit 1
fi

WIDGETS_ENABLED="$(/usr/libexec/PlistBuddy -c 'Print :LoofitWidgetsEnabled' "$INFO_PLIST" 2>/dev/null || true)"
if [[ "$WIDGETS_ENABLED" != "false" ]]; then
  echo "App-only Info.plist must declare LoofitWidgetsEnabled=false." >&2
  exit 1
fi
DEVELOPMENT_REGION="$(
  /usr/libexec/PlistBuddy -c 'Print :CFBundleDevelopmentRegion' "$INFO_PLIST" 2>/dev/null || true
)"
if [[ "$DEVELOPMENT_REGION" != "$NATIVE_LANGUAGE" ]]; then
  echo "App-only Info.plist must declare CFBundleDevelopmentRegion=$NATIVE_LANGUAGE." >&2
  exit 1
fi
if ! /usr/libexec/PlistBuddy -c 'Print :CFBundleLocalizations' "$INFO_PLIST" 2>/dev/null \
  | grep -qx "    $NATIVE_LANGUAGE"; then
  echo "App-only Info.plist must declare $NATIVE_LANGUAGE in CFBundleLocalizations." >&2
  exit 1
fi
if ! grep -q "developmentRegion = $NATIVE_LANGUAGE;" "$PROJECT_FILE"; then
  echo "App-only Xcode project must use developmentRegion=$NATIVE_LANGUAGE." >&2
  exit 1
fi
if [[ -d ios/ExpoWidgetsTarget ]] || grep -q 'ExpoWidgetsTarget' "$PROJECT_FILE" || grep -q 'target "ExpoWidgetsTarget"' ios/Podfile; then
  echo "App-only clean prebuild retained Widget Extension artifacts." >&2
  exit 1
fi
if find ios -maxdepth 3 -name '*.entitlements' -type f -print0 \
  | xargs -0 grep -l 'com.apple.security.application-groups' >/dev/null 2>&1; then
  echo "App-only clean prebuild retained an App Group entitlement." >&2
  exit 1
fi

echo "App-only clean prebuild contains no Widget Extension or App Group artifacts."
