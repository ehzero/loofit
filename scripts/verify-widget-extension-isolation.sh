#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_FILE="ios/app.xcodeproj/project.pbxproj"
PODFILE="ios/Podfile"
PODS_PROJECT="ios/Pods/Pods.xcodeproj"
INFO_PLIST="ios/app/Info.plist"
WIDGET_INFO_PLIST="ios/ExpoWidgetsTarget/Info.plist"
RENDERER_SOURCE="ios/ExpoWidgetsTarget/LoofitWidgetRendererContract.generated.swift"
FORBIDDEN_PATTERN='ExpoModules|React|[Hh]ermes|use_expo|use_react_native|expo_widgets'
APP_GROUP_IDENTIFIER='group.com.loofit.app'
NATIVE_LANGUAGE='ko'

if [[ ! -f "$PROJECT_FILE" || ! -f "$PODFILE" || ! -d "$PODS_PROJECT" || ! -f "$INFO_PLIST" || ! -f "$WIDGET_INFO_PLIST" ]]; then
  echo "Full-widget iOS project or installed Widget Extension pods are missing." >&2
  echo "Run npm run ios:prebuild:widgets and pod install first." >&2
  exit 1
fi

for PLIST in "$INFO_PLIST" "$WIDGET_INFO_PLIST"; do
  CONFIGURED_APP_GROUP="$(
    /usr/libexec/PlistBuddy -c 'Print :ExpoWidgetsAppGroupIdentifier' "$PLIST" 2>/dev/null || true
  )"
  if [[ "$CONFIGURED_APP_GROUP" != "$APP_GROUP_IDENTIFIER" ]]; then
    echo "$PLIST must declare ExpoWidgetsAppGroupIdentifier=$APP_GROUP_IDENTIFIER." >&2
    exit 1
  fi

  CONFIGURED_DEVELOPMENT_REGION="$(
    /usr/libexec/PlistBuddy -c 'Print :CFBundleDevelopmentRegion' "$PLIST" 2>/dev/null || true
  )"
  if [[ "$CONFIGURED_DEVELOPMENT_REGION" != "$NATIVE_LANGUAGE" ]]; then
    echo "$PLIST must declare CFBundleDevelopmentRegion=$NATIVE_LANGUAGE." >&2
    exit 1
  fi
  if ! /usr/libexec/PlistBuddy -c 'Print :CFBundleLocalizations' "$PLIST" 2>/dev/null \
    | grep -qx "    $NATIVE_LANGUAGE"; then
    echo "$PLIST must declare $NATIVE_LANGUAGE in CFBundleLocalizations." >&2
    exit 1
  fi
done

WIDGETS_ENABLED="$(/usr/libexec/PlistBuddy -c 'Print :LoofitWidgetsEnabled' "$INFO_PLIST" 2>/dev/null || true)"
if [[ "$WIDGETS_ENABLED" != "true" ]]; then
  echo "Full-widget Info.plist must declare LoofitWidgetsEnabled=true." >&2
  exit 1
fi

APP_ENTITLEMENTS="$(find ios/app -maxdepth 2 -name '*.entitlements' -type f -print -quit)"
WIDGET_ENTITLEMENTS="$(find ios/ExpoWidgetsTarget -maxdepth 2 -name '*.entitlements' -type f -print -quit)"
for ENTITLEMENTS in "$APP_ENTITLEMENTS" "$WIDGET_ENTITLEMENTS"; do
  if [[ -z "$ENTITLEMENTS" ]] || ! /usr/libexec/PlistBuddy \
    -c 'Print :com.apple.security.application-groups' "$ENTITLEMENTS" 2>/dev/null \
    | grep -q "$APP_GROUP_IDENTIFIER"; then
    echo "Full-widget app and extension must both contain $APP_GROUP_IDENTIFIER entitlement." >&2
    exit 1
  fi
done

if [[ ! -f "$RENDERER_SOURCE" ]] || ! grep -q 'LoofitWidgetRendererContract.generated.swift in Sources' "$PROJECT_FILE"; then
  echo "Generated Widget renderer contract is missing from ExpoWidgetsTarget sources." >&2
  exit 1
fi

TARGET_BLOCK="$(awk '
  /^target "ExpoWidgetsTarget" do$/ { capture = 1 }
  capture { print }
  capture && /^end$/ { exit }
' "$PODFILE")"

if [[ -z "$TARGET_BLOCK" ]]; then
  echo "ExpoWidgetsTarget is missing from ios/Podfile." >&2
  exit 1
fi
if ! grep -q "pod 'LoofitWorkoutCore'" <<<"$TARGET_BLOCK"; then
  echo "ExpoWidgetsTarget does not link LoofitWorkoutCore." >&2
  exit 1
fi
if grep -Eiq "$FORBIDDEN_PATTERN" <<<"$TARGET_BLOCK"; then
  echo "ExpoWidgetsTarget Podfile block contains an Expo, React Native, or Hermes runtime dependency:" >&2
  echo "$TARGET_BLOCK" >&2
  exit 1
fi

if grep -Eiq 'Pods-ExpoWidgetsTarget/ExpoModulesProvider|Pods-ExpoWidgetsTarget/expo-configure-project' "$PROJECT_FILE"; then
  echo "ExpoWidgetsTarget still contains Expo runtime source or build phases." >&2
  grep -Ein 'Pods-ExpoWidgetsTarget/ExpoModulesProvider|Pods-ExpoWidgetsTarget/expo-configure-project' "$PROJECT_FILE" >&2
  exit 1
fi

# React Native's app-level post-install hook can add global header/VFS search
# paths to every aggregate xcconfig. Those paths are build-environment noise,
# not linked dependencies. Verify the actual CocoaPods dependency graph and
# linker-facing settings instead.
ruby - "$PODS_PROJECT" <<'RUBY'
require 'xcodeproj'

project = Xcodeproj::Project.open(ARGV.fetch(0))
target = project.targets.find { |candidate| candidate.name == 'Pods-ExpoWidgetsTarget' }
abort 'Pods-ExpoWidgetsTarget aggregate target is missing.' unless target

dependencies = target.dependencies.map { |dependency| dependency.target&.name }.compact.sort
expected = ['LoofitWorkoutCore']
unless dependencies == expected
  abort "Widget Extension pod dependencies must be #{expected.inspect}, got #{dependencies.inspect}."
end
RUBY

BUILD_SETTINGS="$(mktemp)"
trap 'rm -f "$BUILD_SETTINGS"' EXIT
xcodebuild \
  -project ios/app.xcodeproj \
  -target ExpoWidgetsTarget \
  -configuration Release \
  -sdk iphonesimulator \
  -showBuildSettings >"$BUILD_SETTINGS"

if ! grep -Eq '^[[:space:]]*SWIFT_OPTIMIZATION_LEVEL = -O$' "$BUILD_SETTINGS"; then
  echo "ExpoWidgetsTarget Release must use SWIFT_OPTIMIZATION_LEVEL=-O." >&2
  exit 1
fi
if ! grep -Eq '^[[:space:]]*SWIFT_COMPILATION_MODE = wholemodule$' "$BUILD_SETTINGS"; then
  echo "ExpoWidgetsTarget Release must use whole-module Swift compilation." >&2
  exit 1
fi
if ! grep -Eq "^[[:space:]]*DEVELOPMENT_LANGUAGE = $NATIVE_LANGUAGE$" "$BUILD_SETTINGS"; then
  echo "ExpoWidgetsTarget must resolve DEVELOPMENT_LANGUAGE=$NATIVE_LANGUAGE." >&2
  exit 1
fi
if ! grep -E '^[[:space:]]*(OTHER_LDFLAGS|FRAMEWORK_SEARCH_PATHS|LIBRARY_SEARCH_PATHS|SWIFT_INCLUDE_PATHS) =' "$BUILD_SETTINGS" \
  | grep -q 'LoofitWorkoutCore'; then
  echo "ExpoWidgetsTarget resolved build settings do not link LoofitWorkoutCore." >&2
  exit 1
fi
if grep -E '^[[:space:]]*(OTHER_LDFLAGS|FRAMEWORK_SEARCH_PATHS|LIBRARY_SEARCH_PATHS|SWIFT_INCLUDE_PATHS) =' "$BUILD_SETTINGS" \
  | grep -Eiq "$FORBIDDEN_PATTERN"; then
  echo "ExpoWidgetsTarget resolved build settings contain Expo, React Native, or Hermes." >&2
  grep -E '^[[:space:]]*(OTHER_LDFLAGS|FRAMEWORK_SEARCH_PATHS|LIBRARY_SEARCH_PATHS|SWIFT_INCLUDE_PATHS) =' "$BUILD_SETTINGS" >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  DERIVED_DATA="$1"
  EXTENSION_DIR="$(find "$DERIVED_DATA/Build/Products" -type d -name 'ExpoWidgetsTarget.appex' -print -quit 2>/dev/null || true)"
  if [[ -z "$EXTENSION_DIR" || ! -x "$EXTENSION_DIR/ExpoWidgetsTarget" ]]; then
    echo "Built ExpoWidgetsTarget.appex was not found under $DERIVED_DATA." >&2
    exit 1
  fi
  if otool -L "$EXTENSION_DIR/ExpoWidgetsTarget" | grep -Eiq 'ExpoModules|React|[Hh]ermes'; then
    echo "Built Widget Extension binary dynamically links a forbidden runtime dependency." >&2
    otool -L "$EXTENSION_DIR/ExpoWidgetsTarget" >&2
    exit 1
  fi
fi

echo "Widget Extension dependency isolation and Release optimization are valid."
