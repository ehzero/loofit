#!/usr/bin/env bash

set -euo pipefail

LOOFIT_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LOOFIT_ROOT_DIR"

if [[ ! -f "android/gradlew" ]]; then
  npm run android:prebuild
fi

LOOFIT_ANDROID_SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$LOOFIT_ANDROID_SDK_ROOT" && -d "/opt/homebrew/share/android-commandlinetools" ]]; then
  LOOFIT_ANDROID_SDK_ROOT="/opt/homebrew/share/android-commandlinetools"
fi
if [[ -z "$LOOFIT_ANDROID_SDK_ROOT" ]]; then
  echo "Android SDK was not found. Set ANDROID_HOME or ANDROID_SDK_ROOT." >&2
  exit 1
fi

LOOFIT_JAVA_HOME="${JAVA_HOME:-}"
if [[ -z "$LOOFIT_JAVA_HOME" && -x "/usr/libexec/java_home" ]]; then
  LOOFIT_JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi

env \
  ANDROID_HOME="$LOOFIT_ANDROID_SDK_ROOT" \
  ANDROID_SDK_ROOT="$LOOFIT_ANDROID_SDK_ROOT" \
  JAVA_HOME="$LOOFIT_JAVA_HOME" \
  ./android/gradlew \
  -p android \
  :loofit-workout-core:testDebugUnitTest \
  "$@"
