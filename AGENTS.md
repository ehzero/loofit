# AGENTS.md

이 문서는 제품 정책과 구현 기준의 기준 문서다. 구현 전에 관련 항목을 먼저 확인하고, 제품 동작을 바꾸는 경우 코드와 함께 이 문서를 갱신한다.

## 제품 요약

핏로그는 세트, 중량, 반복 횟수를 기록하는 앱이 아니다.

사용자가 자신의 루틴을 설정하면 앱이 다음 운동을 안내하고, 사용자는 앱 또는 위젯에서 운동을 시작/종료한다. 기록은 운동 시간, 운동 부위, 상태를 중심으로 쌓이고 히트맵과 대시보드로 확인한다.

핵심 문구:

> 내 루틴대로, 운동을 가볍게 기록하세요.

## 용어 기준

- `루틴`: 사용자가 반복해서 수행하는 전체 운동 흐름.
- `분할`: 루틴 안에서 순서대로 수행되는 단위. 예: Push, Pull, Legs.
- `운동 부위`: 기록의 가장 작은 운동 대상 단위. 예: 가슴, 등, 하체, 유산소.
- `다음 운동`: 사용자가 설정한 루틴 순서에 따라 다음에 수행해야 할 운동.
- `자유 운동`: 루틴 밖에서 사용자가 직접 선택해 기록하는 운동. 루틴 진행에는 반영하지 않는다.

제품 문서와 UI 문구에서는 `추천 운동`, `다음 루틴`, `루틴 데이` 표현을 피한다. 구현 내부에서는 필요하면 `routine_days` 같은 테이블명을 사용할 수 있지만, 제품 개념으로는 `루틴 안의 분할`로 설명한다.

## 핵심 정책

- 다음 운동은 AI 추천이 아니라 사용자가 설정한 루틴 순서 기반이다.
- 다음 운동으로 안내된 분할이 아닌 다른 분할을 완료해도, 실제 완료한 분할 기준으로 다음 운동이 정해진다.
- 완료된 루틴 운동만 루틴 진행에 반영한다.
- 루틴 밖 자유 운동은 기록만 남기고 루틴 진행에는 반영하지 않는다.
- 취소한 운동은 기록에는 남기되, 루틴 진행과 운동 시간 통계에는 반영하지 않는다.
- 운동 시간과 관계없이 종료된 세션은 완료 기록으로 저장한다.
- 하루에 여러 개의 루틴 운동을 완료하면 완료 횟수만큼 루틴이 진행된다.
- 기록 수정/삭제는 다음 운동을 자동 재계산하지 않는다.
- 다음 운동이 어긋났다면 사용자가 루틴 설정에서 다음 운동 시작점을 직접 조정한다.
- 운동 중 운동 대상을 변경해도 같은 세션과 경과 시간을 유지하고 최종 운동 대상만 바꾼다.
- active 세션은 앱 종료, 백그라운드, 장시간 방치와 관계없이 유지하고 앱 재실행 시 복구한다.
- 과거 기록은 저장 시점의 운동 부위와 분할 이름 스냅샷으로 표시하며, 이후 루틴·분할·운동 부위 이름 변경이나 삭제의 영향을 받지 않는다.

## 제품 경험 기준

- 홈은 앱의 중심 화면이며 운동 전, 운동 중, 운동 후 상태를 한 화면 흐름 안에서 처리한다.
- 운동 전에는 다음 운동과 시작 액션, 운동 중에는 현재 운동과 경과 시간 및 종료 액션, 운동 후에는 완료 기록과 다음 운동을 우선한다.
- 사용자는 첫 실행에서 루틴이 없음을 이해하고, 루틴을 만든 뒤 첫 운동 시작까지 막힘없이 도달할 수 있어야 한다.
- 다음 운동 시작은 가장 짧은 경로로 제공하되, 루틴 안의 다른 분할과 자유 운동 선택은 앱 안에서 제공한다.
- 운동 종료 후에는 기록, 히트맵, 다음 운동 반영을 통해 저장 완료를 명확히 확인할 수 있어야 한다.
- 대시보드의 30일 히트맵은 오늘을 포함한 정확히 30일만 표시한다. 요일 열은 일요일 시작 순서로 고정하고, 범위 시작일 이전 날짜 셀은 만들지 않는다.
- 위젯은 빠른 확인과 시작/종료에 집중하고, 루틴 선택·자유 운동·설정·기록 수정 같은 복잡한 조작은 앱에서 수행한다.
- 네이티브 스플래시 화면은 앱 설정을 읽기 전 표시되므로 기기 시스템의 라이트·다크 모드에 맞는 앱 팔레트를 사용한다. 저장된 앱 테마와 액센트 컬러는 앱 초기화 이후 적용한다.

## MVP 범위

포함:

- 홈 화면의 운동 전, 운동 중, 운동 후 상태
- 루틴 설정
- 다음 운동 안내
- 운동 시작, 종료, 취소
- 루틴 안의 다른 분할 선택
- 루틴 밖 자유 운동
- 기록 목록, 기록 상세, 수정, 삭제
- 7일/30일/6개월 히트맵
- 운동 기록 대시보드
- iOS 위젯과 Live Activity 우선 검증

제외:

- 세트, 중량, 반복 횟수 기록
- 운동 종목 DB
- AI 코칭
- 식단, 체중 기록
- 커뮤니티, 친구 공유
- 로그인, 백엔드, 클라우드 동기화
- 구독 결제
- 운동 일시정지

## 구현 기준

- React Native + Expo + TypeScript + Expo Router 기반이다.
- 패키지 매니저는 `npm`을 사용한다.
- SQLite를 영속 데이터의 원천으로 사용하고, Zustand는 현재 세션과 화면 상태 캐시로 사용한다.
- 로그인과 백엔드 동기화 없이 Local-first로 동작한다.
- 앱 버전의 단일 원천은 루트 `package.json`의 `version`이다. `app.config.js`가 Expo 버전에 반영하고 앱 UI는 `expo-constants`로 주입된 버전을 표시한다.
- 날짜 계산과 히트맵 귀속은 기기 로컬 시간 기준으로 처리한다.
- 위젯과 Live Activity는 Expo Go가 아니라 iOS Development Build 기준으로 검증한다.
- iOS 앱은 iPhone 전용으로 배포하며 `ios.supportsTablet`을 활성화하지 않는다.
- Android 위젯과 고정 알림은 iOS MVP 반응 확인 후 확장한다.

## 위젯 아키텍처

### 제공 범위

- 홈 화면 운동 위젯: 다음 운동 시작, 운동 중 경과 시간과 종료, 당일 완료 상태를 제공한다.
- 홈 화면 히트맵 위젯: 지난 7일, 지난 5주, 6개월 기록을 제공한다. 지난 5주는 이번 주를 포함해 일요일 시작 달력 행 5개를 항상 표시하며 실제 집계 범위는 4주 전 일요일부터 오늘까지다. 코드의 `month` variant와 `HeatmapMonthWidget`, `year` variant와 `HeatmapYearWidget` 이름은 기존 위젯 식별자 호환을 위해 유지하는 내부 명칭이다.
- 잠금 화면 위젯: 다음 운동, 운동 중, 당일 완료 상태와 지난 7일 요약을 제공한다.
- Live Activity: 운동 중 상태, 경과 시간, 종료 액션을 제공한다.
- 운동 완료 상태는 당일 자정까지 유지하고 다음 날 다음 운동 상태로 돌아간다.

### 구현 원칙

- `/ios`와 `/android`는 생성 산출물로 ignore되어 있다. 유지해야 하는 네이티브 변경은 config plugin, `plugins/native-widgets`, 로컬 Expo 모듈, patch-package 중 해당 원천에 남긴다.
- `modules/loofit-workout-core`가 iOS 앱, 홈·잠금 화면 위젯, Live Activity가 공유하는 운동 명령과 surface 동기화의 단일 원천이다. 시작, 운동 대상 변경, 종료, 취소 정책은 이 모듈에서 SQLite 트랜잭션으로 처리한다.
- `LoofitWorkoutCore` Pod는 Expo 의존성이 없는 순수 Swift Core이고 앱의 Expo bridge는 `LoofitWorkoutExpoAdapter` Pod로 분리한다. Widget Extension은 `LoofitWorkoutCore`만 링크하며 ExpoModulesCore, React Native, Hermes를 포함하지 않는다.
- `plugins/with-loofit-heatmap-widgets.js`는 `plugins/native-widgets/*.swift`의 typed TimelineProvider, SwiftUI 렌더러와 Live Activity를 iOS 위젯 타깃에 생성하고 `LoofitWorkoutCore`를 링크한다. 홈 위젯과 Live Activity의 AppIntent는 Core가 제공한다.
- 실제 iOS 위젯은 `expo-widgets`의 범용 JS 평가나 timeline 저장소를 사용하지 않는다. 패키지는 autolinking에서 제외하고 Widget Extension 타깃과 entitlement 생성 config plugin 용도로만 유지한다.
- 앱 내 미리보기와 SwiftUI 위젯의 레이아웃·variant·표시 정책 원천은 `src/widgets/widget-renderer-contract.json` 하나다. 변경 후 `npm run generate:widget-contract`로 TS, Core layout, Widget Extension Swift 산출물을 함께 갱신하며 생성 파일은 직접 수정하지 않는다. `src/widgets/widget-spec.ts`, 히트맵·잠금화면 모델은 이 계약을 소비한다.
- 네이티브 히트맵의 날짜 범위·달력 정렬·6개월 월 경계 slot은 `modules/loofit-workout-core/ios/LoofitHeatmapLayout.swift`가 담당한다. 지난 5주는 4주 전 일요일부터 오늘까지 29~35일을 집계하고 현재 주의 남은 칸은 투명 placeholder로 채워 항상 5행을 유지한다. 6개월은 첫 달 이후 매월 1일 앞에 7개 gap slot을 넣어 월 경계부터 한 열씩 이동한다.
- 7일 히트맵은 상단 요약 제목을 표시하지 않는다. 하단에는 `횟수`, `총 시간`, `평균`을 이 순서로 항상 표시하고, 완료 기록이 없어도 `최근 운동` 영역과 `아직 기록 없음` 상태를 유지한다.
- 히트맵 일자 숫자는 운동하지 않은 셀에서 보조 텍스트 색을 사용하고, 60분 미만 운동 셀에서는 테마 제목색(다크 모드 흰색, 라이트 모드 검정색), 60분 이상 셀에서는 액센트 대비색을 사용한다.
- 히트맵 셀 크기는 고정값이 아니라 컨테이너 너비, padding, gap, 열 수를 기준으로 동적 계산한다.
- iOS에서 앱과 위젯은 App Group의 `LoofitWidgets` 디렉터리에 있는 SQLite DB를 공유한다. 이전 기본 DB나 다른 공유 디렉터리의 개발 데이터는 자동으로 복사하지 않으며, build mode나 저장소 baseline을 바꿀 때는 개발 데이터를 초기화한다.
- DB version, table·column, index, 위젯 sync trigger 계약의 원천은 `contracts/workout-schema.json` 하나다. 현재 미출시 완성 스키마 전체를 version 1 baseline으로 사용하고, 출시 후 첫 스키마 변경부터 version 2 migration을 추가한다. migration은 버전마다 빠짐없이 선언하고 생성된 `새 테이블 → 기존 테이블 column → index·trigger → 후처리` 순서를 TS와 Swift가 동일하게 실행한다. 현재 version이면 schema 작업 없이 반환하고, 낮은 version에만 미적용 migration을 실행하며, 지원 version보다 높은 DB는 즉시 오류로 처리한다. 적용 완료 migration의 backfill이나 repair를 반복 실행하지 않는다. 변경 후 `npm run schema:generate`로 양쪽 산출물을 함께 갱신하고, 생성 파일은 직접 수정하지 않는다.
- 앱 DB 접근 구현은 `src/db/repositories/*`와 `src/db/queries/*`에 책임별로 둔다. 앱 계층은 안정적인 facade인 `src/db/repository.ts`를 통해 접근하며 repository 사이 의존성은 body part → routine → session → overview query 방향을 유지한다.
- 관련 DB 변경은 `widget_sync_state` revision을 증가시킨다. Core는 DB를 한 번 읽어 semantic snapshot을 만들고 App Group 파일에 atomic replace한 뒤 변경된 위젯만 reload하고 Live Activity를 조정한다.
- 앱, 홈 위젯, Live Activity의 시작·종료 진입점은 모두 같은 Core pipeline을 호출한다. 앱 초기화·foreground와 루틴·기록·테마 변경 후 reconcile이 미완료 revision을 복구한다.
- Core 명령 결과의 `status`는 DB 변경 결과(`applied`, `noop`, `stale`, `rejected`)이고 `publicationStatus`는 surface 발행 결과(`published`, `pending`, `skipped`)다. DB commit 뒤 발행이 실패해도 명령 성공을 실패로 바꾸지 않고 `pending`과 dirty revision을 반환해 다음 reconcile에서 복구한다.
- 앱 Store의 모든 mutation은 결과와 관계없이 SQLite에서 `getOverview()`를 다시 읽는다. `getOverview()`는 하나의 read transaction에서 완성해 서로 다른 revision의 값을 섞지 않으며, mutation coordinator는 쓰기를 직렬화하고 이전 foreground 조회가 최신 mutation 결과를 덮지 못하게 한다.
- UI는 Store의 typed action result를 기준으로 성공 안내, 화면 이동, sheet·dialog 닫기를 결정한다. `pending`과 앱 전용 빌드의 `skipped`는 DB 변경 성공으로 취급하고, `rejected`, 실행 오류, overview 갱신 실패는 성공으로 표시하지 않는다.
- 완료·취소·운동 대상 변경은 `expectedSessionId`가 현재 active 세션과 일치할 때만 적용해 오래된 위젯 액션이 새 세션을 변경하지 못하게 한다.
- `src/widgets/widget-spec.ts`, `src/widgets/heatmap-widget-model.ts`, `src/widgets/lock-screen-widget-model.ts`는 앱 내 미리보기용으로 유지하며 실제 native runtime 동기화 코드로 사용하지 않는다.
- `LOOFIT_APP_ONLY=1`은 `expo-widgets` plugin과 공유 DB 사용을 끄되 iOS 앱의 운동 명령은 같은 Core를 사용하고 surface 발행만 생략한다.
- 설치된 iOS 바이너리는 `LoofitWidgetsEnabled` 값을 build mode의 기준으로 사용한다. 위젯 활성 빌드에서 App Group DB 디렉터리에 접근할 수 없거나 JS가 다른 build mode를 요청하면 기본 DB로 대체하지 않고 즉시 오류로 처리한다. 앱 전용 빌드만 기본 앱 DB를 정상 사용한다.
- 운동 명령 정책을 변경하면 `contracts/workout-command-scenarios.json`을 갱신한다. Node 22 `node:sqlite` 기반 TS repository fallback 테스트와 Swift Core 테스트가 같은 시나리오를 실행해 `applied`·`noop`·`stale`·`rejected`, 중복 종료, 자유 운동, 취소 정책의 parity를 검증한다.

### 위젯 검증

- 위젯과 Live Activity는 Expo Go가 아니라 iOS Development Build에서 검증한다.
- JS/TS 표시 모델은 앱 미리보기로 빠르게 확인할 수 있지만, 실제 크기·폰트·타이머·AppIntent·자정 전환은 설치된 iOS 위젯에서 확인한다.
- config plugin, `plugins/native-widgets`, `modules/loofit-workout-core`, `app.config.js`, `app.json` 변경 후에는 `npm run ios:prebuild:widgets`로 네이티브 프로젝트를 동기화한 뒤 `npm run ios`로 빌드한다.

## 자주 쓰는 명령

- `npm run typecheck`
- `npm test`
- `npm run schema:check`
- `npm run check:widget-contract`
- `npm run contracts:check`
- `npm run test:command-contract`
- `npm run test:ios-core`
- `npm run ios:prebuild:widgets`
- `npm run ios:prebuild:app-only`
- `npm run ios:build`
- `npm run ios`
- `npm run start`

## App Store listing과 Fastlane

- Fastlane은 App Store Connect의 한국어 제품 페이지 메타데이터, 스크린샷, 선택적 앱 미리보기 영상만 관리한다. iOS 바이너리 빌드와 제출은 EAS가 담당한다.
- 원천 파일은 `fastlane/metadata`, `fastlane/screenshots`, `fastlane/app-previews`에 둔다. `fastlane/Deliverfile`은 실행 위치에 흔들리지 않도록 저장소 루트 기준 절대 경로를 사용한다.
- `npm run store:metadata`는 메타데이터만, `npm run store:screenshots`는 스크린샷만, `npm run store:listing`은 두 항목을 함께 업로드한다. 모든 lane은 바이너리 업로드와 심사 제출을 생략하며 앱을 출시하지 않는다.
- `APP_STORE_VERSION`은 수정할 편집 가능 버전을 명시한다. 현재 대상은 `1.0.0`이며 한국어 메타데이터와 앱 심사 연락처는 App Store Connect에 업로드되어 있다. 첫 버전은 출시 노트를 별도로 반영하지 않는다.
- App Store Connect 인증 값은 Git에서 제외된 `fastlane/.env`에만 둔다. `.p8` 개인키는 저장소 밖에서 권한 `600`으로 보관하고 출력·로그·커밋에 포함하지 않는다. Team API 키는 `ASC_ISSUER_ID`가 필요하고 Individual API 키는 비워둔다.
- 시스템 Ruby를 사용하지 않는다. 현재 로컬 검증은 Ruby 3.2.2로 수행했지만 Fastlane의 지원 종료 경고가 있으므로 다음 환경 갱신 시 Ruby 3.3 이상으로 올린다.
- 앱 심사 정보는 성 `윤`, 이름 `태영`, 국제 형식 전화번호 `+82 10-3773-0967`, 이메일 `support@physiquehub.kr`를 사용한다. 로그인과 데모 계정은 필요 없으며 관련 필드를 비워둔다.
- 현재 확인되지 않아 비워둔 App Store 필드는 저작권 표기다. 정확한 소유자 표기를 확인하기 전에는 임의 값을 넣지 않는다.
- Fastlane 2.237.0은 첫 버전에 심사 상세가 없을 때 미설정 심사 첨부파일을 조회해 `No data`로 실패한다. `Fastfile`은 첨부파일 경로를 명시한 경우에만 해당 리소스를 관리하며, 원격 첨부파일을 임의로 삭제하지 않는다.
- `skip_docs`를 유지해 Fastlane 실행이 저장소의 `fastlane/README.md`를 자동 생성 문서로 덮어쓰지 않게 한다.
- 스크린샷은 `fastlane/screenshots/ko`에 파일명 숫자 접두사 순서로 둔다. 업로드 시 기존 스크린샷을 교체하며, 완료 전에는 `store:screenshots` 또는 `store:listing`을 실행하지 않는다.

GitHub Actions CI는 Node 22에서 생성 계약 drift, TypeScript, Vitest, 스타일 토큰을 검사한다. macOS 26 job은 full-widget prebuild와 Pods 설치 후 Widget Extension 의존성 격리 및 Release 최적화를 확인하고 앱 빌드와 native Core 테스트를 실행한 다음, app-only clean prebuild에 위젯·App Group 잔여물이 없는지와 앱 빌드를 검증한다.

## 빌드와 실행

이 앱은 위젯과 Live Activity를 검증해야 하므로 Expo Go 기준으로 판단하지 않는다. 기본 검증 기준은 iOS Development Build다.

### 1. 일반 검증

코드 변경 후 먼저 아래 명령을 실행한다.

- `npm run typecheck`
- `npm test`

문서나 단순 스타일 변경처럼 테스트와 무관한 작업이 아니라면, 완료 전 두 명령을 우선 확인한다.

### 2. iOS 네이티브 프로젝트 생성·동기화

위젯을 포함하는 일반 iOS 프로젝트는 다음 명령으로 기존 `ios/`에 config plugin 결과를 동기화한다.

- `npm run ios:prebuild:widgets`

앱 전용 프로젝트로 전환할 때는 다음 명령을 사용한다. 이전 Widget Extension과 entitlement가 남지 않도록 `ios/`를 clean prebuild한다.

- `npm run ios:prebuild:app-only`

두 명령은 네이티브 프로젝트 생성만 수행하며 CocoaPods 설치와 앱 빌드는 다음 단계에서 수행한다. 위젯 타깃, Pod, `app.json`, `app.config.js`, config plugin, 로컬 네이티브 모듈 변경이 있으면 해당 build mode의 prebuild를 먼저 실행한다.

### 3. 생성된 iOS 프로젝트 빌드

이미 생성·동기화된 `ios/`를 빌드하고 설치할 때 사용한다.

- `npm run ios`
- `npm run ios:build`

두 명령은 같은 동작을 하며 추가 인자를 그대로 `expo run:ios`에 전달한다. 예: `npm run ios -- --device '탱폰' --no-bundler`. `ios/`가 없거나 build mode 표식이 없는 오래된 산출물이면 임의로 prebuild하지 않고 어떤 prebuild 명령을 실행해야 하는지 안내하며 종료한다.

### 4. Metro 실행

Development Build로 설치된 앱에 JS 번들을 공급할 때 사용한다.

- `npm run start -- --dev-client --host localhost`

시뮬레이터에서 앱이 `Could not connect to development server` 화면을 보이면 Metro가 꺼져 있거나 Expo Go 모드로 떠 있을 가능성이 높다. 이때는 위 명령으로 dev-client 모드 Metro를 띄운 뒤 앱을 다시 연다.

### 5. 빠른 새로고침

JS/TS 화면 코드, 컴포넌트, 스타일 변경은 대체로 재빌드가 필요 없다.

- 저장 시 Fast Refresh가 자동 반영된다.
- 시뮬레이터에서 전체 JS 리로드가 필요하면 `Cmd + R`을 누른다.
- Metro 터미널에서는 `r`로 리로드할 수 있다.

다음 변경은 재빌드가 필요하다.

- `ios/` 네이티브 코드 변경
- 위젯 또는 Live Activity 네이티브 설정 변경
- `app.json`, `app.config.js`의 네이티브 설정 변경
- 새 네이티브 모듈 설치
- Pod 또는 Xcode 프로젝트 설정 변경

### 6. 시뮬레이터 수동 실행

Metro가 켜져 있는데 앱이 이전 오류 화면에 머물면 앱 프로세스를 재시작하고 dev-client URL로 다시 연다.

- `xcrun simctl terminate booted com.loofit.app || true`
- `xcrun simctl openurl booted 'com.loofit.app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'`

현재 번들 ID는 `com.loofit.app`이다.

### 7. 실기기와 EAS

원격 EAS 빌드는 `eas.json` 기준으로 실행한다. iOS 우선 검증 앱이므로 TestFlight 제출은 `production` 프로필을 사용한다.

프로필 기준:

- `development`: 실기기 Development Build
- `development-simulator`: iOS 시뮬레이터 Development Build
- `preview`: 내부 배포용 빌드
- `production`: TestFlight/App Store 제출용 빌드

처음 EAS를 사용할 때는 아래를 확인한다.

- Expo/EAS 프로젝트 연결: `@ehzero/loofit`
- EAS projectId: `803560ac-f833-44f7-8e5f-b47144d1df1c`
- Apple Developer Team 및 bundle identifier 권한
- App Group 설정: `group.com.loofit.app`
- Widget Extension 및 Live Activity 권한
- App Store Connect 앱 레코드 생성

TestFlight 제출:

- `npx eas-cli@latest build --platform ios --profile production --auto-submit`

빌드와 제출을 나눠서 진행하려면:

- `npx eas-cli@latest build --platform ios --profile production`
- `npx eas-cli@latest submit --platform ios --profile production --latest`

`production`은 `cli.appVersionSource: remote`와 `autoIncrement: true`를 사용하므로, TestFlight 중복 빌드 번호를 피하기 위해 EAS 원격 빌드 번호를 기준으로 관리한다.

현재 EAS/TestFlight 상태:

- `npx eas-cli@latest init`으로 Expo 프로젝트는 생성되어 있다.
- `app.config.js`가 dynamic config라 EAS projectId는 자동 삽입되지 않았고, `extra.eas.projectId`에 수동으로 넣어둔 상태다.
- iOS 암호화 수출 규정 프롬프트에서 EAS CLI가 한 번 크래시했으므로 `app.config.js`의 `ios.config.usesNonExemptEncryption: false`와 `app.json`의 `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`를 유지한다.
- 첫 `production` 빌드 시 EAS remote `buildNumber`는 `1`로 초기화되었다.
- TestFlight 업로드는 아직 완료되지 않았다. 직전 시도는 Apple 2단계 인증 코드 입력 단계에서 중단했다.
- iOS 빌드는 앱 타깃 `com.loofit.app`과 위젯 타깃 `com.loofit.app.widgets`의 credentials를 모두 설정해야 한다. 두 타깃은 Distribution Certificate를 공유할 수 있지만 Provisioning Profile은 각각 필요하다.

Patch 관리:

- 위젯 도메인 동작은 repo 소유 Core와 native widget source로 이동했으므로 `expo-widgets` patch를 다시 만들지 않는다.
- `patches/expo-modules-jsi+57.0.1.patch`는 Swift 6 호환을 위한 `apple/Sources/**` 실제 소스 변경만 포함한다. DerivedData, xcframework, LICENSE 같은 산출물을 포함하지 않는다.
- `patches/expo-sqlite+57.0.0.patch`는 Expo 접두사 SQLite 헤더가 시스템 `sqlite3.h`와 충돌하지 않도록 CocoaPods 공개 헤더명을 분리한다.
