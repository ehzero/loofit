# 루핏 자체 인증 계약

## 목적과 현재 범위

루핏은 카카오와 Apple을 사용자 인증 제공자로 사용하고, 인증이 끝난 사용자를 내부 `userId`로 식별한 뒤 루핏 Access Token과 Refresh Token을 발급한다. 소셜 제공자 토큰은 신원 확인에만 사용하며 루핏 API 인증에는 사용하지 않는다.

현재 구현 범위:

- 내부 사용자·소셜 identity·세션 DynamoDB 모델
- 동일 identity의 중복 가입 방지
- Refresh Token 생성·해시 저장·일회성 회전
- 만료 세션 TTL 정리 기반

현재 구현하지 않는 범위:

- 카카오·Apple authorization code 교환과 ID Token 검증
- Access Token 발급 API와 KMS `Sign`
- 앱 로그인 UI와 SecureStore 저장
- 로그아웃·계정 전환·계정 연결·계정 병합·계정 삭제 API
- 로컬 운동 기록 동기화

## 계정과 identity 정책

- 지원 provider는 `KAKAO`, `APPLE` 두 개다.
- 소셜 identity의 유일성 기준은 `(provider, providerSubject)`다.
- 같은 카카오 `sub` 또는 같은 Apple `sub`로 루핏 계정을 둘 이상 만들 수 없다.
- 동일 사용자가 카카오와 Apple로 각각 가입하는 것은 허용하며 서로 다른 루핏 계정이 된다.
- 서로 다른 provider identity를 자동으로 연결하거나 기존 계정을 자동 병합하지 않는다.
- 이메일·닉네임·전화번호를 계정 동일성 판단에 사용하지 않는다.
- 향후 계정 연결을 추가하더라도 현재 로그인 사용자에게 재인증된 미사용 identity를 붙이는 경우만 허용한다. 이미 다른 사용자에 귀속된 identity는 자동 병합하지 않는다.

내부 `userId`는 UUID로 생성하고 이후 provider가 바뀌더라도 서버 데이터 소유권의 기준으로 사용한다.

## provider 검증 계약

향후 로그인 handler는 앱이 전달한 authorization code를 provider token endpoint에서 교환하고 다음을 검증해야 한다.

- 서명과 `kid`
- 정확한 `iss`
- 루핏 앱의 client ID와 일치하는 `aud`
- `exp`, `iat`
- 로그인 시작 시 발급한 일회성 `nonce`와 `state`
- PKCE `code_verifier`

검증이 끝나면 provider ID Token의 `sub`만 identity 생성·조회에 사용한다. authorization code, access token, refresh token, ID Token 원문은 DynamoDB나 애플리케이션 로그에 저장하지 않는다.

## 루핏 토큰 계약

### Access Token

- 형식: JWT
- 알고리즘: `RS256`
- 서명: `alias/loofit-production-auth-signing` KMS 키
- 권장 유효기간: 15분
- audience: `loofit-api`
- issuer: 현재 프로덕션 API issuer

필수 claim:

| Claim | 의미 |
| --- | --- |
| `sub` | 내부 `userId` |
| `sid` | 내부 `sessionId` |
| `iss` | 루핏 JWT issuer |
| `aud` | `loofit-api` |
| `iat` | 발급 시각 |
| `exp` | 만료 시각 |
| `jti` | Access Token 고유 ID |

Access Token에는 이메일, provider access token, 운동 기록, 광고 식별자를 넣지 않는다.

### Refresh Token

- 형식: 클라이언트가 해석하지 않는 `lrt1.<sessionId>.<32-byte secret>`
- 권장 유효기간: 30일
- DynamoDB에는 전체 Refresh Token의 SHA-256 해시만 저장한다.
- 갱신할 때 같은 `sessionId`에 새 secret을 발급하고 해시를 조건부 교체한다.
- 이미 사용한 Refresh Token, 만료된 세션, 폐기된 세션의 갱신은 거부한다.
- 동시에 같은 Refresh Token으로 갱신하면 DynamoDB 조건부 쓰기에 성공한 첫 요청만 유효하다.
- Refresh Token endpoint는 JWT Authorizer로 보호하지 않고 Refresh Token 자체를 자격 증명으로 검증한다.

현재 저장 계층은 이전 Refresh Token 재사용을 거부하지만 세션 전체를 자동 폐기하지는 않는다. 재사용 탐지 시 세션 전체 폐기는 로그인 API를 공개하기 전에 별도 보안 정책으로 확정한다.

## DynamoDB 단일 테이블 모델

테이블: `loofit-production-user-data`

기본 키와 entity:

| Entity | `pk` | `sk` | 설명 |
| --- | --- | --- | --- |
| 사용자 | `USER#<userId>` | `PROFILE` | 내부 사용자 상태 |
| identity | `IDENTITY#<PROVIDER>#<subjectHash>` | `USER` | provider identity에서 내부 사용자로 매핑 |
| 세션 | `SESSION#<sessionId>` | `SESSION` | Refresh Token 해시와 만료 상태 |

`subjectHash`는 `SHA-256(provider + NUL + providerSubject)`의 base64url 값이다. provider의 원본 `sub`는 저장하지 않는다.

`byUser` GSI:

| Entity | `gsi1pk` | `gsi1sk` |
| --- | --- | --- |
| identity | `USER#<userId>` | `IDENTITY#<PROVIDER>#<subjectHash>` |
| 세션 | `USER#<userId>` | `SESSION#<sessionId>` |

GSI는 향후 계정 삭제 시 귀속 identity와 세션을 조회하고, 사용자의 활성 세션을 관리하기 위한 역방향 조회에 사용한다.

세션 item의 `expiresAt`은 Unix epoch seconds이며 DynamoDB TTL의 원천이다. TTL 삭제는 즉시성을 보장하지 않으므로 API는 모든 갱신에서 `expiresAt`을 직접 검사해야 한다.

## 원자성과 동시성

- 신규 가입은 사용자 item과 identity item을 `TransactWriteItems`로 함께 생성한다.
- identity item에는 `attribute_not_exists` 조건을 사용해 동시 가입에서도 한 사용자만 생성한다.
- 동시 가입 충돌 시 생성에 실패한 요청은 identity를 다시 읽어 먼저 생성된 사용자를 사용한다.
- 세션 생성은 활성 사용자 존재 확인과 세션 생성을 하나의 transaction으로 실행한다.
- Refresh Token 회전은 기존 해시, 미폐기 상태, 만료 시각을 하나의 조건식으로 검사한 뒤 새 해시로 교체한다.

## 개인정보와 앱 동작

- 인증 모델이 저장하는 개인정보성 식별자는 내부 `userId`, provider 종류, provider subject의 단방향 해시, 세션 메타데이터다.
- 이메일·닉네임은 현재 수집하지 않는다.
- 로컬 운동 기록은 로그인 또는 인증 인프라 존재만으로 서버에 업로드하지 않는다.
- 로그인하지 않은 사용자는 기존 Local-first 운동 기능을 계속 사용할 수 있어야 한다.
- 분석·광고 SDK와 인증 데이터의 결합은 별도 동의·스토어 고지 검토 전에는 하지 않는다.

## 향후 API 경계

최소 로그인 API는 다음 순서로 추가한다.

```text
POST /v1/auth/kakao/exchange
POST /v1/auth/apple/exchange
POST /v1/auth/refresh
GET  /v1/me
```

`/v1/me`만 현재 JWT Authorizer에 연결해 첫 end-to-end 보호 API로 사용한다. 로그인과 refresh endpoint는 공개 route이되 rate limit, 입력 검증, provider 검증, 오류 응답 균질화를 적용한다.
