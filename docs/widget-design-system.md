# 위젯 디자인 시스템

위젯의 공통 제품 의미와 브랜드 기초 원천은 `src/widgets/widget-renderer-contract.json`이다. 앱 내 RN 미리보기, iOS WidgetKit, Android 실제 위젯과 Android 런처 선택 화면 미리보기는 이 계약에서 생성된 TypeScript·Swift·Kotlin·Android 리소스를 사용한다. 공통 계약은 기능, 콘텐츠, 정보 우선순위, 상태·데이터·인터랙션 정책을 동일하게 유지하지만 플랫폼 간 픽셀 동일성을 요구하지 않는다.

계약의 `surfaceKinds`는 iOS와 Android가 제공하는 12개 위젯 식별자를 고정하고, `platformPolicy`는 두 플랫폼의 렌더링 경계를 명시한다. 현재 iOS 위젯 디자인과 골든 이미지는 동결 기준이며 Android 개선 작업에서 변경하지 않는다. Android는 런처 크기, 시스템 타이포 메트릭, `RemoteViews` 제약에 맞춘 별도 레시피로 렌더링하고 Android RN 미리보기 역시 같은 대표 viewport를 사용한다. `platformPolicy.android.providerSizing`은 런처 provider의 최소 크기와 목표 셀을 관리하며, 잠금화면형은 `250dp × 40dp`, `4 × 1`로 요청해 `accessoryRectangular` 미리보기 비율과 실제 배치의 세로 편차를 줄인다. 실제 잠금화면형 위젯의 투명 surface는 유지하고 RN 미리보기에서만 `accessoryPreviewBackdrop`의 대표 어두운 배경을 사용해 흰색 시스템 콘텐츠의 대비를 보장한다.

계약의 `previewPalette` 라이트·다크 팔레트와 `previewFixture`는 플랫폼별 미리보기의 고정 예시 색상과 콘텐츠다. Android 런처 선택 화면은 `values`·`values-night` 리소스로 시스템 모드에 맞는 팔레트를 고른다. 생성 산출물에는 같은 SHA-256 fingerprint를 기록해 서로 다른 계약 버전의 TS·Swift·Kotlin 파일이 섞이지 않게 한다.

## 최소 토큰

- 텍스트 색상은 `textHigh`, `textMedium`, `textLow`, `textWeekend` 네 역할만 사용한다. 액센트 배경의 자동 대비색 `onAccent`는 사용자가 선택하는 텍스트 variant가 아니라 접근성용 contextual alias다. `todayIndicator`는 텍스트 색상이 아니라 오늘 셀 표시 전용 비텍스트 의미 색상이다.
- 텍스트 크기는 `sm 8/10`, `md 12/16`, `lg 16/21`, `xl 26/31` 네 단계만 사용한다. 앞 숫자는 font size, 뒤 숫자는 line height다.
- 텍스트 굵기는 `bold 800`, `medium 700`, `light 600` 세 단계만 사용한다.
- 간격은 `xs 2`, `sm 4`, `md 8`, `lg 12` 네 단계만 사용한다. 정렬을 위한 `0`은 토큰 variant로 세지 않는다.
- 모서리는 `cell 3`, `control 12`, `container 24` 세 단계만 사용한다.
- 홈 화면 위젯의 바깥 content padding은 짧은 변 `158`에서 `12`를 기준으로 컨테이너의 짧은 변에 비례해 계산한다. iOS는 기존 WidgetKit family 기준을 그대로 유지한다. Android는 대표 미리보기에 `platformPolicy.android.previewViewports`를 사용하고 실제 위젯에는 런처가 전달한 정확한 크기를 사용하므로, 정사각형을 가정하지 않고 같은 비율 계산을 적용한다. 잠금화면 accessory와 Dynamic Island처럼 시스템이 외곽 영역을 관리하는 surface는 플랫폼 시스템 여백 정책을 따른다.
- 투명도는 `default 1`, `muted 0.72`, 최소 글자 축소율은 `default 0.75`, `dense 0.68`만 사용한다.

## 반응형 배치

- 운동 위젯 Small의 상단 상태, 중앙 운동 정보, 하단 액션·결과는 고정 높이 슬롯이나 고정된 영역 간 gap을 두지 않는다.
- 세 영역은 컨테이너의 사용 가능한 세로 공간을 `space-between`으로 분배한다. SwiftUI에서는 영역 사이의 유연한 `Spacer`, 앱 미리보기에서는 `justifyContent: 'space-between'`을 같은 정책으로 사용한다.
- 제목과 상세, 완료 시간과 시간 범위처럼 하나의 의미 묶음 안에서만 최소 토큰 간격을 사용한다.

## 루틴 진행 위젯

홈 화면 Small의 `루틴 진행`은 순환형 루틴의 `다음 분할의 현재 순서`를 기준으로 텍스트 목록형만 제공한다. 분할 별칭이 없으면 운동 부위를 제목으로 사용하며 같은 운동 부위 메타데이터는 생략한다.

- 텍스트 목록형은 별도 루틴명과 진행 위치를 생략하고 `xl` 분할명을 순서대로 세로 정렬한다. 각 항목의 첫 줄에는 분할명과 `오늘`·`어제`·`N일 전` 상대 날짜, 둘째 줄에는 `sm` 크기의 운동 시간과, 별칭이 있을 때만 운동 부위를 함께 표시한다. 현재 순서 항목의 모든 텍스트만 액센트 컬러로 강조하며 나머지 항목은 가장 연한 `textLow`를 사용한다.
- 항목은 `space-between`으로 배치하며 고정 영역 높이를 두지 않는다.
- 텍스트는 기존 최소 토큰만 사용하고 카드 바깥 여백과 모서리도 다른 홈 화면 위젯과 공유한다.
- 잠금화면 Rectangular 변형은 최대 3개 분할을 현재 순서가 포함되도록 선택하고 좌우 열로 정렬한다. 각 열은 `lg` 운동 별칭과 `md` 상대 날짜만 표시하며 별칭이 없으면 운동 부위명을 사용한다. 운동 별칭 또는 부위와 상대 날짜는 각 열의 가운데로 정렬한다. 현재 순서에는 시스템 `textHigh`, 나머지에는 `textLow`를 사용한다.
- 잠금화면 `지난 3주`와 `다음 3주`는 시스템이 관리하는 accessory 여백 안에서 일요일 시작 7열·3행과 상단 요일 행을 동적으로 배분한다. `지난 3주`는 이전 2주와 현재 주, `다음 3주`는 현재 주와 이후 2주를 표시한다. 유색은 사용하지 않고 `일`·`토` 요일은 시스템 보조 텍스트, 나머지는 시스템 기본 텍스트를 사용한다. 셀은 시스템 단색의 운동 시간 구간별 명도와 일자 숫자를 함께 표시하며 운동 기록이 없는 날짜는 배경 없는 빈 셀로 유지한다. 오늘 셀은 운동 유무와 관계없이 흰색 외곽선으로 강조한다.
- 앱 내 미리보기와 실제 iOS·Android 위젯에서 같은 선택·정렬·의미 색상 정책을 사용하되, 실제 색상 표현과 여백은 플랫폼 surface 규칙을 따른다.

## 부위별 운동 시간 위젯

홈 화면 Small의 `최근 30일 부위별 운동 시간`은 합산 시간이 긴 운동 부위 4개를 내림차순으로 보여준다.

- 완료 세션에 포함된 각 운동 부위에 해당 세션의 전체 운동 시간을 귀속한다. 부위별 시간을 따로 측정한 값이 아니므로 여러 부위가 포함된 세션은 각 부위에 중복 귀속되고, 행의 합은 전체 운동 시간과 일치하지 않을 수 있다.
- 상단 기간 제목과 각 행의 부위명·시간·비교 막대를 표시하며, 행은 사용 가능한 세로 공간에 `space-between`으로 배치한다.
- 막대 길이는 표시된 항목 중 가장 긴 시간을 기준으로 정규화하고 기존 액센트와 surface 색상 역할을 사용한다.
- 앱 내 미리보기와 실제 iOS·Android 홈 화면 Small 위젯에서 같은 집계·정렬 정책을 사용한다.

## 히트맵 스타일

히트맵은 데이터 범위와 시각 스타일을 분리한다.

- `detailed`: 지난 7일, 지난 5주, 이번 달이 공유한다. 7열, 요일 행, 날짜 숫자, `sm` 텍스트, `sm` 셀 간격, `cell` radius를 사용한다.
- `expanded`: Medium 지난 4주 상세가 사용한다. `detailed`의 7열 달력과 색상 정책을 유지하면서 셀을 세로로 확장해 일자 아래 한 줄 운동 부위를 추가한다. 여러 부위는 `·`로 연결하고 셀 너비를 넘으면 말줄임한다. 요일 행은 `sm` 텍스트 line-height만 사용하고 남은 세로 공간은 4개 날짜 행에 균등 배분하며, 앱 미리보기와 SwiftUI가 같은 계산을 사용한다.
- `compact`: 지난 6개월이 사용한다. 날짜와 요일 행을 생략하고 월 라벨만 표시하며 `xs` 셀 간격과 `cell` radius를 사용한다.

지난 7일 Small의 `횟수`, `총 시간`, `평균` 통계 라벨은 `sm`, 통계 값은 `lg`를 사용해 정보 위계를 구분한다.

`week`, `month`, `year` variant는 기간·정렬·요약 같은 제품 동작만 정의하고, 렌더링 수치는 `detailed`, `expanded`, `compact` 스타일에서 상속한다. 이번 달 위젯은 `detailed` 스타일을 사용하며 헤더에 연도 없이 `{월} · {횟수}회`를 표시하고 4~6행을 컨테이너 안에 맞추도록 셀 크기를 동적으로 계산한다. Medium 지난 4주 상세 위젯은 `expanded` 스타일을 사용하고 4개 달력 행을 남은 세로 공간에 균등 배치한다. 두 항목 모두 앱 내 미리보기와 실제 iOS·Android 위젯으로 제공한다.

## 플랫폼 렌더링 경계

- RN은 생성된 TS 계약과 공통 fixture를 소비한다. iOS에서는 동결된 WidgetKit 비율을, Android에서는 `platformPolicy.android.previewViewports`의 런처 대표 비율을 사용한다.
- iOS는 생성된 Swift 계약을 기존 SwiftUI 렌더러가 소비하며 Android 디자인 개선으로 레이아웃이나 골든 hash를 변경하지 않는다.
- Android는 semantic snapshot을 `LoofitWidgetRenderPlanBuilder`로 정규화한 뒤, 정적 surface는 `LoofitWidgetBitmapRenderer`가 전체 카드를 그린다. 운동 상태 위젯은 시스템 `Chronometer`와 클릭 액션을 유지하기 위해 같은 계획을 `RemoteViews`로 투영한다. Android 12 이상은 `OPTION_APPWIDGET_SIZES`의 각 크기에 맞는 exact-size `RemoteViews`를 제공해 최소 크기 비트맵이 늘어나거나 잘리는 현상을 방지한다. 이전 버전은 현재 화면 방향에 해당하는 크기 범위를 사용한다.
- Android 런처의 12개 `previewLayout`과 provider metadata XML은 `scripts/generate-widget-renderer-contract.mjs`가 계약 토큰, fixture, `providerSizing`에서 생성한다. 런처 미리보기나 provider XML을 직접 편집하거나 별도 색상·크기 상수를 추가하지 않는다.
- Android 고정 알림은 시스템 소유 레이아웃이므로 정확한 픽셀 형태가 제조사와 OS에 따라 달라질 수 있다. 제목·상세·동적 타이머·종료 액션의 콘텐츠 계약만 공통 기준으로 검증한다.

이번 달 위젯의 첫째·마지막 주에 포함된 월 바깥 날짜는 배경 셀 없이 `textLow` 날짜 숫자만 표시한다. 오늘 셀은 운동 유무와 관계없이 `todayIndicator` 색상의 `1.5pt` 테두리로 강조한다. 이 색상은 선택한 액센트마다 함께 계산한다. 다크모드는 흰색, 라이트모드는 검정색을 기본으로 사용하되 다크모드의 흰색 계열 액센트와 라이트모드의 검정색 계열 액센트처럼 기본 표시색과 구분하기 어려운 경우에는 테마의 붉은색 `danger`를 사용한다. 현재 달 셀의 채움색과 날짜 텍스트 색상 정책은 변경하지 않는다.

## 토큰 참조

컴포넌트 레시피의 디자인 값은 `{spacing.lg}`, `{radius.cell}`, `{typography.md.size}` 형식으로 기초 토큰을 참조한다. 생성기는 참조와 히트맵 스타일 상속을 실제 값으로 해석하여 TypeScript·Swift·Kotlin과 Android 선택 화면 리소스에 기록한다. 알 수 없는 토큰, 순환 참조, 허용되지 않은 토큰 variant는 생성 단계에서 오류로 처리한다.

날짜 범위, 열 수, 표시 개수처럼 제품 동작을 결정하는 값은 디자인 토큰으로 만들지 않고 해당 컴포넌트 레시피에 직접 둔다.

## 변경 절차

1. 기능, 콘텐츠, 정보 우선순위, 상태·데이터·인터랙션 정책은 공통 컴포넌트·variant 계약을 수정한다.
2. 브랜드 기초 토큰은 `designSystem`에서 관리하되 현재 iOS 시각 결과가 바뀌는 변경은 별도 iOS 디자인 작업으로만 수행한다.
3. Android 외곽 비율·런처 크기·렌더링 방식은 `platformPolicy.android`와 Android 렌더러를 수정한다.
4. `npm run generate:widget-contract`로 TypeScript, Swift Core, Widget Extension, Kotlin Core와 Android 선택 화면 리소스를 함께 갱신한다.
5. `npm run check:widget-contract`, `npm run typecheck`, `npm test`를 실행한다.
6. iOS는 `npm run test:ios-widgets`로 동결된 실제 WidgetKit SwiftUI 렌더러를 확인한다. Android 개선 작업에서는 실패 원인을 제거하되 iOS 기준 hash를 갱신하지 않는다.
7. Android는 `npm run test:android-core`의 12개 variant 라이트·다크·상태·빈 상태·리사이즈·큰 글자 PNG hash 회귀 검사를 통과시킨다.
8. Android 네이티브 레이아웃에 영향이 있으면 `npm run android:prebuild`와 `npm run android:build`로 검증한다. iOS 파일의 구조적 생성 변경이 없다면 iOS prebuild는 생략하되 동결 골든 테스트는 유지한다.
9. 자동 검사 뒤 Android 런처 선택 화면·실제 배치 위젯·ongoing notification을 에뮬레이터와 지원 실기기에서 Android RN 미리보기와 비교한다. iOS는 기존 기준선이 유지됐는지만 별도로 확인한다.

iOS 시각 회귀용 루트 `Package.swift`는 생성되는 `/ios` 프로젝트와 분리된 테스트 harness다. Widget Extension의 `@main` 등록 파일만 제외하고 `plugins/native-widgets`의 실제 SwiftUI 렌더러와 `LoofitWorkoutCore`를 그대로 컴파일한다. 현재 기준은 `iPhone 17 Pro / iOS 26.1`이며 `scripts/test-ios-widget-renderer.sh`가 이 조합을 명시적으로 선택한다. 다른 설치 환경에서는 `LOOFIT_IOS_WIDGET_SIMULATOR_ID`로 동일 기준 시뮬레이터를 지정한다. Android 개선 작업에서는 iOS 기준 hash를 갱신하지 않는다. 동적 타이머, AppIntent 실행, WidgetKit 시스템 margin·material은 픽셀 테스트가 고정할 수 없으므로 설치된 Development Build에서 별도로 검증한다.

생성 파일은 직접 수정하지 않으며, RN·Swift·Kotlin 렌더러에 새로운 디자인 숫자, 굵기 또는 앱 팔레트 키를 직접 추가하지 않는다.
