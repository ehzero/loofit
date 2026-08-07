# 루핏 서버와 AWS 인프라

## 경계

- `server`: Lambda handler와 이후 API 도메인·worker 코드
- `infra`: AWS CDK stack, 네트워크, 권한, 데이터 저장소, 관측성
- 앱 루트와 `modules`: 기존 Local-first 앱과 네이티브 운동 Core

인프라 배포만으로 앱의 로컬 운동 기록은 전송되지 않는다. 사용자가 소셜 로그인에 성공한 뒤 앱의 단방향 동기화 worker가 명시된 trigger에서만 기록을 전송한다.

## 현재 프로덕션 구성

- AWS Region: `ap-northeast-2`
- CDK stacks:
  - `LoofitProductionData`: DynamoDB 사용자 데이터·랭킹 테이블
  - `LoofitProductionService`: HTTP API, `/health`, Kakao·Apple 로그인·토큰 갱신, `/v1/me`, 운동 기록 업로드·백업 조회, 회원 탈퇴 API·삭제 queue/worker, 자체 인증, API/Lambda 로그와 경보
- DynamoDB는 삭제 방지 및 `RETAIN` 정책을 사용한다.
- DynamoDB는 `PAY_PER_REQUEST`로 운영하며 테이블별 최대 처리량을 읽기 1,000, 쓰기 500 request unit/초로 제한한다.
- 사용자 데이터 테이블 `loofit-production-user-data`는 `pk`·`sk` 복합 키, 35일 시점 복구(PITR), 세션 정리용 `expiresAt` TTL을 사용한다. `byUser` GSI는 `gsi1pk`·`gsi1sk`로 사용자에 귀속된 identity와 세션을 역조회한다.
- 랭킹 테이블 `loofit-production-leaderboard`는 `period`·`userId` 복합 키, `byScore` GSI, 계정 삭제 역조회용 `byUser` GSI, `expiresAt` TTL을 사용한다. 랭킹은 원본 기록에서 다시 만들 수 있는 파생 데이터이므로 PITR은 사용하지 않는다.
- 두 테이블은 DynamoDB 기본 서버 측 암호화(AWS 소유 키)를 사용한다. 전용 VPC, NAT Gateway, 데이터 암호화용 고객 관리 KMS 키, DB 비밀값은 만들지 않는다.

## 자체 인증 기반

현재 단계는 Kakao·Apple OIDC로 사용자를 확인하고 루핏 Access/Refresh Token을 발급한다. 로그인한 사용자의 완료·취소 운동 기록은 로컬 SQLite를 SSOT로 유지하면서 DynamoDB에 단방향 백업한다. 인증은 [`auth-contract.md`](./auth-contract.md), 동기화는 [`workout-sync-contract.md`](./workout-sync-contract.md)를 따른다.

- 인증 토큰용 KMS 키 `alias/loofit-production-auth-signing`
  - `RSA_2048`, `SIGN_VERIFY`, JWT 알고리즘 `RS256`
  - CloudFormation 제거·교체 시 `RETAIN`
  - 비대칭 KMS 키는 자동 회전을 지원하지 않으므로 실제 교체 시 신·구 키를 JWKS에 함께 노출하는 수동 절차가 필요하다.
- 공개 issuer endpoint
  - `GET /.well-known/openid-configuration`: issuer와 JWKS 위치 공개
  - `GET /.well-known/jwks.json`: KMS 공개키를 표준 RSA JWK로 변환해 공개
  - 공개키 Lambda는 `kms:GetPublicKey`만 가진다. 비밀키는 KMS 밖으로 나오지 않으며 Kakao·Apple exchange와 refresh Lambda에만 `kms:Sign`을 허용한다.
- API Gateway JWT Authorizer
  - issuer: 프로덕션 API Gateway URL
  - audience: `loofit-api`
  - `Authorization: Bearer <JWT>`에서 토큰을 읽고 `GET /v1/me`, `POST /v1/account/deletion`, `POST /v1/workouts/sync`, `GET /v1/workouts/backup`, `GET /v1/workouts/backup/records`를 보호한다.

## 운동 기록 단방향 백업

- `POST /v1/workouts/sync`는 JWT `sub`를 사용자 ID로 사용하고 요청 body의 사용자 식별자를 신뢰하지 않는다.
- 첫 요청의 `datasetId`를 `USER#<userId>`·`BACKUP#WORKOUTS` item에 바인딩하며 이후 다른 dataset은 `409`로 거부한다.
- 기록은 `USER#<userId>`·`WORKOUT#<syncId>` item에 전체 snapshot으로 저장한다. 삭제는 payload가 없는 versioned tombstone으로 교체한다.
- 업로드 Lambda 권한은 사용자 데이터 테이블의 `dynamodb:GetItem`, `dynamodb:PutItem`, backup revision 갱신용 `dynamodb:UpdateItem`으로 제한한다. 백업 조회 Lambda는 `dynamodb:GetItem`, `dynamodb:Query`만 사용하며 두 Lambda 모두 KMS 서명·SSM·랭킹 테이블 권한을 갖지 않는다.
- 요청은 최대 50개 operation·512KiB로 제한한다. 서버는 높은 revision만 적용하고 같은 revision은 멱등 성공으로 처리한다.
- 로컬 변경과 outbox는 SQLite transaction으로 함께 commit한다. 앱은 로그인 성공, 운동 완료·취소, 기록 편집·삭제, 앱 시작·foreground와 외부 운동 명령 확인 후 동기화한다. 랭킹 탭 진입과 로그아웃 직전에는 별도 실행하지 않는다.
- 업로드가 완료된 batch마다 dataset 상태의 `backupRevision`과 `updatedAt`을 갱신한다. 앱은 업로드 전에 서버 dataset을 확인하고 다른 dataset이면 자동 업로드를 중단한다.
- `GET /v1/workouts/backup`은 dataset·revision·마지막 백업 시각을 반환하고 `GET /v1/workouts/backup/records`는 DynamoDB의 기록·tombstone을 최대 100개씩 일관 읽기로 반환한다.
- 앱은 설정의 명시적 확인 후 모든 page와 전후 revision을 검증하고 SQLite 단일 transaction으로 병합한다. 로컬 기록 전체 교체, 자동 다중 기기 동기화, 다른 계정 dataset 병합은 수행하지 않는다.

- 카카오 로그인
  - `POST /v1/auth/kakao/exchange`는 네이티브 Kakao SDK의 ID Token을 우선 지원하고 웹에서는 Authorization Code를 카카오 토큰 endpoint로 교환한다.
  - 카카오 JWKS로 OIDC ID Token의 서명·issuer·audience·만료를 검증하며 REST code 흐름은 nonce까지 검증한다. `sub`만 내부 identity로 사용한다.
  - 로그인 route는 공개지만 초당 5개, burst 10개로 별도 제한한다.
  - Kakao Native app key와 선택적인 REST API key·Client Secret·Redirect URI allowlist는 `/loofit/production/auth/kakao` SecureString에 저장한다.
  - Lambda는 사용자 테이블 read/write·transaction, 해당 parameter read, KMS sign만 허용받는다.
- Apple 로그인
  - `POST /v1/auth/apple/exchange`는 iOS AuthenticationServices가 발급한 ID Token과 앱의 32바이트 nonce를 검증한다.
  - Apple JWKS의 `RS256` 서명, `iss=https://appleid.apple.com`, `aud=com.loofit.app`, 만료·발급 시각, `sub`, `nonce`를 확인하고 `sub`만 내부 identity로 사용한다.
  - Apple exchange Lambda는 사용자 테이블 read/write·transaction과 KMS sign만 허용받고 별도 Apple private key나 비밀값은 사용하지 않는다.
  - 로그인 route는 공개지만 초당 5개, burst 10개로 제한한다.
- 토큰 갱신
  - `POST /v1/auth/refresh`는 현재 Refresh Token의 해시를 조건부 교체하고 새 토큰 쌍을 발급한다.
  - refresh Lambda는 사용자 테이블의 `UpdateItem`과 KMS `Sign`만 허용받는다.
  - 공개 route지만 로그인과 동일하게 초당 5개, burst 10개로 제한하며 만료·폐기·재사용 토큰을 동일한 `401`로 거부한다.
- 로그아웃
  - `POST /v1/auth/logout`은 현재 Refresh Token 해시가 일치하는 세션에 `revokedAt`을 기록한다.
  - logout Lambda는 사용자 테이블의 `UpdateItem`만 허용받고, 유효하지 않거나 이미 폐기된 토큰도 `204`로 응답한다.
  - 앱은 서버 폐기 실패와 관계없이 현재 기기의 SecureStore 토큰을 삭제하며 로컬 운동 기록은 유지한다.
- 회원 탈퇴
  - `POST /v1/account/deletion`은 JWT 사용자와 저장 provider를 확인하고 카카오·Apple 재인증을 요구한다.
  - 사용자 상태를 먼저 `DELETING`으로 바꿔 신규 로그인·refresh·운동 기록 업로드를 차단한다.
  - 카카오는 연결 해제 API를 호출하고 Apple은 authorization code 교환 후 refresh token을 revoke한다.
  - 요청을 `loofit-production-account-deletion` SQS에 발행하고 `202 PROCESSING`을 반환한다. queue는 1일 보관, 2분 visibility timeout, 최대 5회 실패 후 14일 보관 DLQ를 사용한다.
  - worker는 운동 백업·tombstone, 랭킹, identity, 세션을 삭제한 뒤 profile을 마지막에 삭제한다. 사용자 테이블의 PITR 사본에는 최대 35일 남을 수 있다.
  - Apple revoke용 `/loofit/production/auth/apple` SecureString에는 Team ID, Key ID와 Sign in with Apple `.p8` private key를 저장한다. CDK는 secret 값을 생성하거나 출력하지 않는다.
  - 앱은 `202`를 받은 뒤에만 SecureStore 토큰을 지우고 로컬 운동 기록과 루틴은 유지한다.
- 앱 네이티브 인증 모듈
  - `@react-native-seoul/kakao-login`으로 카카오톡 SSO와 카카오계정 fallback을 사용하고 Kakao ID Token을 exchange endpoint로 보낸다.
  - 가운데 정렬된 `expo-apple-authentication` 공식 시스템 버튼과 `expo-crypto` nonce로 iOS Apple 로그인을 시작하며 이메일·이름 scope는 요청하지 않는다.
  - 루핏 토큰 쌍은 `expo-secure-store`에 하나의 versioned JSON으로 저장한다. 만료 60초 전 자동 갱신하고 동시 갱신 요청은 한 번으로 합친다.
  - 랭킹 탭의 비로그인 상태에서 Kakao·Apple 로그인 CTA를 제공하며 Expo Go가 아니라 네이티브 Development Build에서 검증한다.
  - 저장 세션이 있으면 랭킹 진입 시 Access Token을 확인·갱신한다. 일시적 연결 실패는 저장 세션을 삭제하지 않고, refresh 거부만 재로그인 상태로 전환한다.

API Gateway는 JWT Authorizer를 생성할 때 issuer discovery endpoint를 실제 호출한다. CDK에는 공개 issuer route와 default stage가 준비된 다음 authorizer를 생성하는 명시적 의존성이 있으며, 이 순서를 제거하면 신규 배포가 실패할 수 있다.

현재 execute-api URL을 issuer로 사용하며 커스텀 도메인 없이 토큰을 발급할 수 있다. 향후 issuer를 바꾸면 기존 Access Token이 새 Authorizer에서 거절되므로 Refresh Token으로 새 토큰을 발급하거나 구·신 issuer 병행 기간을 둔다. API 호출 도메인과 issuer 도메인은 같을 필요가 없으므로 커스텀 도메인을 추가하더라도 issuer를 즉시 바꿀 필요는 없다.

아직 포함하지 않는 항목:

- 자동 다중 기기 동기화와 서버 백업으로 로컬 전체 교체
- 계정 전환 시 로컬 dataset 이전
- 분석 이벤트 저장소
- 랭킹 집계·동점 처리·부정 기록 방지
- 광고와 인앱 결제
- 사용자 도메인과 TLS 인증서
- 경보 수신 SNS 구독

## 로컬 검증

각 디렉터리에서 한 번씩 의존성을 설치한다.

```sh
npm --prefix ./server install
npm --prefix ./infra install
npm run server:check
npm run infra:check
npm run infra:synth
```

`infra:synth`는 자격 증명이 없는 CI에서도 재현되도록 CDK의 온라인 검증을 끈다. AWS 계정·리전 기준 검증은 `infra:diff`와 배포에서 수행한다.

## 배포

현재 AWS CLI 자격과 계정을 먼저 확인한다.

```sh
aws sts get-caller-identity
aws configure get region
npm run infra:diff
npm run infra:deploy
```

`infra:deploy`는 IAM 권한 확대가 있으면 CDK 승인을 요구한다. 배포 계정 ID는 저장소에 고정하지 않으며 CDK가 현재 AWS CLI 자격에서 해석한다.

배포 후 `LoofitProductionService` stack의 `HealthUrl`, `KakaoExchangeUrl`, `AppleExchangeUrl`, `RefreshUrl`, `LogoutUrl`, `MeUrl`, `AccountDeletionUrl`, `WorkoutSyncUrl`, `WorkoutBackupUrl`, `JwtIssuer`, `JwksUrl`, `JwtAudience` output을 확인한다. JWKS 응답에는 `kid`, `kty=RSA`, `alg=RS256`, `use=sig`가 있어야 한다.

## 운영 주의사항

- 현재 최신 `aws-cdk-lib@2.263.0`은 빌드 도구 내부에 `brace-expansion@5.0.8`을 번들해 `npm audit`의 DoS 경고가 남는다. 서버 런타임 번들에는 포함되지 않으며 CDK가 수정 버전을 번들한 릴리스로 올라오면 즉시 갱신한다.
- CloudFormation stack을 삭제해도 DynamoDB와 인증 서명 KMS 키는 보존된다. 이 리소스의 실제 삭제는 별도 데이터·키 파기 절차와 승인을 거쳐야 한다.
- 인증 키는 `RETAIN`이므로 실패한 CloudFormation 생성도 alias 없는 키를 남길 수 있다. 롤백 후에는 생성 시각·설명·태그·alias·연결 상태로 정확한 미사용 키를 식별하고, 필요한 경우 30일 대기 삭제로 정리한다.
- DynamoDB 온디맨드는 유휴 읽기·쓰기 용량 비용이 없고 실제 요청량과 저장량에 따라 과금된다. 사용자 데이터 테이블에는 PITR 저장 비용이 추가되며, 랭킹 테이블은 TTL로 오래된 파생 데이터를 정리한다.
- 인증 서명용 고객 관리 KMS 키에는 월 고정 키 보관 비용이 발생하고 로그인마다 KMS 서명 요청 1회가 추가된다.
- API와 Lambda 로그는 30일 보관하며 요청 payload나 인증 토큰을 기록하지 않는다.
- 현재 CloudWatch 경보에는 수신 대상이 없다. 운영 연락 채널이 정해지면 SNS topic과 구독을 추가한다.
- Cognito 같은 관리형 인증 제공자와 사용자 디렉터리는 배포하지 않는다. Kakao·Apple 로그인과 refresh·logout route는 공개이고 `/v1/me`와 회원 탈퇴는 루핏 JWT로 보호한다. Google 로그인은 별도 단계에서 추가한다.
