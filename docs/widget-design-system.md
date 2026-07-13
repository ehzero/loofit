# 위젯 디자인 시스템

위젯 디자인의 단일 원천은 `src/widgets/widget-renderer-contract.json`이다. 앱 내 미리보기와 iOS 위젯은 이 계약에서 생성된 TypeScript와 Swift 값을 사용한다.

## 최소 토큰

- 텍스트 색상은 `textHigh`, `textMedium`, `textLow`, `textWeekend` 네 역할만 사용한다. 액센트 배경의 자동 대비색 `onAccent`는 사용자가 선택하는 텍스트 variant가 아니라 접근성용 contextual alias다. `todayIndicator`는 텍스트 색상이 아니라 오늘 셀 표시 전용 비텍스트 의미 색상이다.
- 텍스트 크기는 `sm 8/10`, `md 12/16`, `lg 16/21`, `xl 26/31` 네 단계만 사용한다. 앞 숫자는 font size, 뒤 숫자는 line height다.
- 텍스트 굵기는 `bold 800`, `medium 700`, `light 600` 세 단계만 사용한다.
- 간격은 `xs 2`, `sm 4`, `md 8`, `lg 12` 네 단계만 사용한다. 정렬을 위한 `0`은 토큰 variant로 세지 않는다.
- 모서리는 `cell 3`, `control 12`, `container 24` 세 단계만 사용한다.
- 홈 화면 위젯과 앱 내 미리보기의 바깥 content padding은 모두 `12`다. 잠금화면 accessory와 Dynamic Island처럼 시스템이 외곽 영역을 관리하는 surface는 `systemManagedInset` 예외로 취급한다.
- 투명도는 `default 1`, `muted 0.72`, 최소 글자 축소율은 `default 0.75`, `dense 0.68`만 사용한다.

## 반응형 배치

- 운동 위젯 Small의 상단 상태, 중앙 운동 정보, 하단 액션·결과는 고정 높이 슬롯이나 고정된 영역 간 gap을 두지 않는다.
- 세 영역은 컨테이너의 사용 가능한 세로 공간을 `space-between`으로 분배한다. SwiftUI에서는 영역 사이의 유연한 `Spacer`, 앱 미리보기에서는 `justifyContent: 'space-between'`을 같은 정책으로 사용한다.
- 제목과 상세, 완료 시간과 시간 범위처럼 하나의 의미 묶음 안에서만 최소 토큰 간격을 사용한다.

## 히트맵 스타일

히트맵은 데이터 범위와 시각 스타일을 분리한다.

- `detailed`: 지난 7일, 지난 5주, 이번 달이 공유한다. 7열, 요일 행, 날짜 숫자, `sm` 텍스트, `sm` 셀 간격, `cell` radius를 사용한다.
- `compact`: 지난 6개월이 사용한다. 날짜와 요일 행을 생략하고 월 라벨만 표시하며 `xs` 셀 간격과 `cell` radius를 사용한다.

지난 7일 Small의 `횟수`, `총 시간`, `평균` 통계 라벨은 `sm`, 통계 값은 `lg`를 사용해 정보 위계를 구분한다.

`week`, `month`, `year` variant는 기간·정렬·요약 같은 제품 동작만 정의하고, 렌더링 수치는 `detailed` 또는 `compact` 스타일에서 상속한다. 이번 달 미리보기는 `detailed` 스타일을 사용하며 4~6행을 컨테이너 안에 맞추도록 셀 크기를 동적으로 계산한다.

이번 달 미리보기의 오늘 셀은 운동 유무와 관계없이 `todayIndicator` 색상의 `1.5pt` 테두리로 강조한다. 이 색상은 선택한 액센트마다 함께 계산한다. 다크모드는 흰색, 라이트모드는 검정색을 기본으로 사용하되 다크모드의 흰색 계열 액센트와 라이트모드의 검정색 계열 액센트처럼 기본 표시색과 구분하기 어려운 경우에는 테마의 붉은색 `danger`를 사용한다. 셀 채움색과 날짜 텍스트 색상 정책은 변경하지 않는다.

## 토큰 참조

컴포넌트 레시피의 디자인 값은 `{spacing.lg}`, `{radius.cell}`, `{typography.md.size}` 형식으로 기초 토큰을 참조한다. 생성기는 참조와 히트맵 스타일 상속을 실제 값으로 해석하여 TypeScript와 Swift 산출물에 기록한다. 알 수 없는 토큰, 순환 참조, 허용되지 않은 토큰 variant는 생성 단계에서 오류로 처리한다.

날짜 범위, 열 수, 표시 개수처럼 제품 동작을 결정하는 값은 디자인 토큰으로 만들지 않고 해당 컴포넌트 레시피에 직접 둔다.

## 변경 절차

1. 공통 외형은 `designSystem` 토큰을 수정한다.
2. 히트맵 밀도 차이는 `heatmap.styles.detailed` 또는 `compact`를 수정한다.
3. 특정 surface의 기능적 배치는 컴포넌트·variant 레시피를 수정한다.
4. `npm run generate:widget-contract`로 TypeScript, Swift Core, Widget Extension 산출물을 함께 갱신한다.
5. `npm run check:widget-contract`, `npm run typecheck`, `npm test`를 실행한다.
6. 네이티브 레이아웃에 영향이 있으면 `npm run ios:prebuild:widgets`와 `npm run ios:build -- --no-bundler`로 검증한다.

생성 파일은 직접 수정하지 않으며, 앱과 Swift 렌더러에 새로운 디자인 숫자, 굵기 또는 앱 팔레트 키를 직접 추가하지 않는다.
