# 루핏 서버와 AWS 인프라

## 경계

- `server`: Lambda handler와 이후 API 도메인·worker 코드
- `infra`: AWS CDK stack, 네트워크, 권한, 데이터 저장소, 관측성
- 앱 루트와 `modules`: 기존 Local-first 앱과 네이티브 운동 Core

인프라 배포만으로 앱의 로컬 운동 기록은 전송되지 않는다. 앱 동기화와 개인정보 동의는 별도 제품 단계에서 구현한다.

## 현재 프로덕션 구성

- AWS Region: `ap-northeast-2`
- CDK stacks:
  - `LoofitProductionData`: DynamoDB 사용자 데이터·랭킹 테이블
  - `LoofitProductionService`: HTTP API, `/health` Lambda, 자체 인증 기반, API/Lambda 로그와 경보
- DynamoDB는 삭제 방지 및 `RETAIN` 정책을 사용한다.
- DynamoDB는 `PAY_PER_REQUEST`로 운영하며 테이블별 최대 처리량을 읽기 1,000, 쓰기 500 request unit/초로 제한한다.
- 사용자 데이터 테이블 `loofit-production-user-data`는 `pk`·`sk` 복합 키, 35일 시점 복구(PITR), 세션 정리용 `expiresAt` TTL을 사용한다. `byUser` GSI는 `gsi1pk`·`gsi1sk`로 사용자에 귀속된 identity와 세션을 역조회한다.
- 랭킹 테이블 `loofit-production-leaderboard`는 `period`·`userId` 복합 키, `byScore` GSI, `expiresAt` TTL을 사용한다. 랭킹은 원본 기록에서 다시 만들 수 있는 파생 데이터이므로 PITR은 사용하지 않는다.
- 두 테이블은 DynamoDB 기본 서버 측 암호화(AWS 소유 키)를 사용한다. 전용 VPC, NAT Gateway, 데이터 암호화용 고객 관리 KMS 키, DB 비밀값은 만들지 않는다.

## 자체 인증 기반

현재 단계는 토큰을 안전하게 발급하고 검증하기 위한 AWS 기반과 사용자·identity·세션 저장 모델을 제공한다. 회원가입·로그인 API와 소셜 로그인 검증은 아직 구현하지 않는다. 상세 계약은 [`auth-contract.md`](./auth-contract.md)를 따른다.

- 인증 토큰용 KMS 키 `alias/loofit-production-auth-signing`
  - `RSA_2048`, `SIGN_VERIFY`, JWT 알고리즘 `RS256`
  - CloudFormation 제거·교체 시 `RETAIN`
  - 비대칭 KMS 키는 자동 회전을 지원하지 않으므로 실제 교체 시 신·구 키를 JWKS에 함께 노출하는 수동 절차가 필요하다.
- 공개 issuer endpoint
  - `GET /.well-known/openid-configuration`: issuer와 JWKS 위치 공개
  - `GET /.well-known/jwks.json`: KMS 공개키를 표준 RSA JWK로 변환해 공개
  - 공개키 Lambda는 `kms:GetPublicKey`만 가진다. 비밀키는 KMS 밖으로 나오지 않으며 `kms:Sign` 권한은 아직 어느 Lambda에도 없다.
- API Gateway JWT Authorizer
  - issuer: 프로덕션 API Gateway URL
  - audience: `loofit-api`
  - `Authorization: Bearer <JWT>`에서 토큰을 읽도록 생성했지만 보호 route에는 아직 연결하지 않았다.

API Gateway는 JWT Authorizer를 생성할 때 issuer discovery endpoint를 실제 호출한다. CDK에는 공개 issuer route와 default stage가 준비된 다음 authorizer를 생성하는 명시적 의존성이 있으며, 이 순서를 제거하면 신규 배포가 실패할 수 있다.

현재 execute-api URL을 issuer로 사용하며 커스텀 도메인 없이 토큰을 발급할 수 있다. 향후 issuer를 바꾸면 기존 Access Token이 새 Authorizer에서 거절되므로 Refresh Token으로 새 토큰을 발급하거나 구·신 issuer 병행 기간을 둔다. API 호출 도메인과 issuer 도메인은 같을 필요가 없으므로 커스텀 도메인을 추가하더라도 issuer를 즉시 바꿀 필요는 없다.

아직 포함하지 않는 항목:

- 앱의 계정·동기화 UI와 API
- 서버 DynamoDB 접근 계층과 실제 동기화 item 계약
- 카카오·Apple 등 소셜 로그인과 루핏 세션 발급
- 회원가입·로그인·로그아웃·토큰 갱신 API
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

배포 후 `LoofitProductionService` stack의 `HealthUrl`, `JwtIssuer`, `JwksUrl`, `JwtAudience` output을 확인한다. JWKS 응답에는 `kid`, `kty=RSA`, `alg=RS256`, `use=sig`가 있어야 한다.

## 운영 주의사항

- 현재 최신 `aws-cdk-lib@2.263.0`은 빌드 도구 내부에 `brace-expansion@5.0.8`을 번들해 `npm audit`의 DoS 경고가 남는다. 서버 런타임 번들에는 포함되지 않으며 CDK가 수정 버전을 번들한 릴리스로 올라오면 즉시 갱신한다.
- CloudFormation stack을 삭제해도 DynamoDB와 인증 서명 KMS 키는 보존된다. 이 리소스의 실제 삭제는 별도 데이터·키 파기 절차와 승인을 거쳐야 한다.
- 인증 키는 `RETAIN`이므로 실패한 CloudFormation 생성도 alias 없는 키를 남길 수 있다. 롤백 후에는 생성 시각·설명·태그·alias·연결 상태로 정확한 미사용 키를 식별하고, 필요한 경우 30일 대기 삭제로 정리한다.
- DynamoDB 온디맨드는 유휴 읽기·쓰기 용량 비용이 없고 실제 요청량과 저장량에 따라 과금된다. 사용자 데이터 테이블에는 PITR 저장 비용이 추가되며, 랭킹 테이블은 TTL로 오래된 파생 데이터를 정리한다.
- 인증 서명용 고객 관리 KMS 키에는 월 고정 키 보관 비용이 발생한다. 현재는 서명 호출이 없고 JWKS Lambda의 공개키 조회 요청만 발생한다.
- API와 Lambda 로그는 30일 보관하며 요청 payload나 인증 토큰을 기록하지 않는다.
- 현재 CloudWatch 경보에는 수신 대상이 없다. 운영 연락 채널이 정해지면 SNS topic과 구독을 추가한다.
- Cognito 같은 관리형 인증 제공자와 사용자 디렉터리는 배포하지 않는다. 현재 공개 API는 `/health`와 `/.well-known/*`뿐이며, 소셜 로그인 도입 전에는 외부 토큰 검증, 내부 사용자 식별자, 세션 회전·폐기, 계정 연결·삭제 정책을 먼저 확정한다.
