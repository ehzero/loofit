#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INFO_PLIST="ios/app/Info.plist"

if [[ ! -f "ios/Podfile" || ! -f "ios/app.xcodeproj/project.pbxproj" || ! -f "$INFO_PLIST" ]]; then
  echo "Generated ios/ project is missing." >&2
  echo "Run npm run ios:prebuild:widgets or npm run ios:prebuild:app-only first." >&2
  exit 1
fi

if ! WIDGETS_ENABLED="$(/usr/libexec/PlistBuddy -c 'Print :LoofitWidgetsEnabled' "$INFO_PLIST" 2>/dev/null)"; then
  echo "Generated ios/ project does not declare its Loofit build mode." >&2
  echo "Run npm run ios:prebuild:widgets or npm run ios:prebuild:app-only first." >&2
  exit 1
fi

echo "Building generated iOS project (LoofitWidgetsEnabled=$WIDGETS_ENABLED)."
exec npx expo run:ios "$@"
