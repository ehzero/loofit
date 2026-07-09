#!/usr/bin/env bash
# 디자인 토큰 가드: UI 코드의 스타일 리터럴 드리프트를 막는다.
#
# 검사 대상: app/**, src/components/** 의 .tsx
# 예외:
#   - app/widgets.tsx        위젯 미러 표면. 실제 위젯 뷰('widget' 격리 컨텍스트가
#                            토큰 import를 막음)와 값을 맞추는 상수를 쓴다.
#   - src/components/Heat.tsx 히트맵 미니 셀은 데이터 밀도에 맞춘 특수 수치 사용.
#   - '#FFFFFF'              dangerSolid 위 고정 대비색 등 계산 불가한 대비 상수.
set -uo pipefail
cd "$(dirname "$0")/.."

EXEMPT='app/widgets\.tsx|src/components/Heat\.tsx'
FILES=$(git ls-files 'app/*.tsx' 'app/**/*.tsx' 'src/components/*.tsx' | grep -Ev "$EXEMPT" | sort -u)

fail=0

check() {
  local label="$1" pattern="$2" extra_filter="${3:-^$}"
  local hits
  hits=$(echo "$FILES" | xargs grep -nE "$pattern" 2>/dev/null | grep -vE "$extra_filter" || true)
  if [ -n "$hits" ]; then
    echo "✗ $label — typeScale/radius/색상 토큰을 사용하세요:"
    echo "$hits" | sed 's/^/    /'
    fail=1
  fi
}

check "fontSize 리터럴" 'fontSize: [0-9]'
check "borderRadius 리터럴" 'borderRadius: [0-9]'
check "하드코딩 hex 색상" "'#[0-9A-Fa-f]{3,8}'" "'#FFFFFF'"

if [ "$fail" -eq 0 ]; then
  echo "✓ style tokens OK"
fi
exit "$fail"
