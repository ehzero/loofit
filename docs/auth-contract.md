# 루핏 자체 인증 계약

## 목적과 현재 범위

루핏은 카카오와 Apple을 사용자 인증 제공자로 사용하고, 인증이 끝난 사용자를 내부 `userId`로 식별한 뒤 루핏 Access Token과 Refresh Token을 발급한다. 소셜 제공자 토큰은 신원 확인에만 사용하며 루핏 API 인증에는 사용하지 않는다.

현재 구현 범위:

- 내부 사용자·소셜 identity·세션 DynamoDB 모델
- 동일 identity의 중복 가입 방지
- Refresh Token 생성·해시 저장·일회성 회전
- 만료 세션 TTL 정리 기반
- 카카오 네이티브 SDK ID Token 및 REST Authorization Code 검증
- Apple 네이티브 ID Token과 nonce 검증
- KMS `RS256` Access Token 서명과 루핏 세션 발급
- `POST /v1/auth/kakao/exchange`
- `POST /v1/auth/apple/exchange`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- 앱 Kakao·Apple 네이티브 로그인 모듈과 SecureStore 토큰 저장·자동 갱신
- 설정 화면의 현재 기기 로그아웃과 서버 세션 폐기
- 랭킹 탭의 Kakao·Apple 로그인 유도 UI와 인증 상태 검증
- JWT Authorizer로 보호하는 `GET /v1/me`
- 로그인 성공 후 로컬 운동 기록 단방향 백업 시작
- JWT Authorizer로 보호하는 `POST /v1/workouts/sync`
- JWT Authorizer로 보호하는 `GET /v1/workouts/backup`과 paginated records 조회
- 설정에서 사용자 확인 후 서버 운동 기록 병합 복원

현재 구현하지 않는 범위:

- Apple 웹 authorization code 교환과 Android·웹 로그인
- 계정 전환·계정 연결·계정 병합·계정 삭제 API
- 자동 다중 기기 동기화와 서버 백업으로 로컬 전체 교체

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

로그인 handler는 Kakao 또는 Apple 네이티브 SDK가 발급한 ID Token을 직접 검증한다. Kakao 웹 REST 흐름을 사용할 때는 앱이 전달한 authorization code를 provider token endpoint에서 교환한 뒤 같은 방식으로 ID Token을 검증한다.

- 서명과 `kid`
- 정확한 `iss`
- 루핏 앱의 client ID와 일치하는 `aud`
- `exp`, `iat`
- 로그인 시작 시 앱이 생성한 일회성 `nonce`
- provider가 지원하는 경우 PKCE `code_verifier`

`state`는 앱이 로그인 시작 전에 생성·보관하고 카카오 redirect callback에서 일치 여부를 확인한 뒤에만 서버 exchange API를 호출한다. 서버는 authorization 요청을 시작한 주체가 아니므로 `state`를 대신 검증하지 않는다.

카카오 REST 토큰 API의 현재 공식 요청 계약에는 `code_verifier`가 없으므로 카카오 흐름에는 PKCE 값을 전송하지 않는다. 카카오 로그인 요청에는 `state`와 OIDC `nonce`를 사용하고, token 교환에는 AWS Parameter Store에 보관한 REST API key와 Client Secret을 사용한다.

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

현재 Access Token 유효기간은 15분이다.

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
- 로컬 운동 기록은 명시적인 소셜 로그인 성공 후에만 `workout-sync-contract.md`의 단방향 백업 정책으로 업로드한다.
- 로그인하지 않은 사용자는 기존 Local-first 운동 기능을 계속 사용할 수 있어야 한다.
- 분석·광고 SDK와 인증 데이터의 결합은 별도 동의·스토어 고지 검토 전에는 하지 않는다.

## 카카오 로그인 API

### 요청: 네이티브 앱 권장 경로

Kakao SDK의 `loginWithKakaoTalk()` 또는 fallback인 `loginWithKakaoAccount()`가 반환한 `OAuthToken.idToken`을 전송한다.

```http
POST /v1/auth/kakao/exchange
Content-Type: application/json

{
  "idToken": "Kakao SDK가 발급한 OIDC ID Token"
}
```

- ID Token의 audience는 Kakao Native app key와 일치해야 한다.
- 카카오톡 SSO와 카카오 계정 fallback 모두 Kakao SDK가 토큰 교환을 끝낸 뒤 같은 요청을 사용한다.
- provider token 원문은 검증 직후 폐기하고 루핏 토큰만 앱에 저장한다.

### 요청: 웹 REST 선택 경로

```http
POST /v1/auth/kakao/exchange
Content-Type: application/json

{
  "code": "카카오 authorization code",
  "redirectUri": "카카오 로그인 요청에 사용한 URI",
  "nonce": "로그인 요청에 사용한 일회성 nonce"
}
```

- `redirectUri`는 Parameter Store allowlist와 정확히 일치해야 한다.
- OIDC가 활성화되지 않아 카카오가 ID Token을 발급하지 않으면 로그인을 거부한다.
- 카카오 ID Token의 `iss`, `aud`, `exp`, `iat`, `nonce`, `sub`, `kid`, `RS256` 서명을 검증한다.
- 카카오 Access Token·Refresh Token·ID Token 원문은 응답, DB, 로그에 남기지 않는다.

### 성공 응답

```json
{
  "tokenType": "Bearer",
  "accessToken": "<Loofit JWT>",
  "expiresIn": 900,
  "refreshToken": "<opaque Loofit refresh token>",
  "refreshTokenExpiresIn": 2592000,
  "user": {
    "id": "<Loofit userId>",
    "created": true
  }
}
```

오류는 `INVALID_REQUEST`, `INVALID_REDIRECT_URI`, `KAKAO_LOGIN_REJECTED`, `AUTH_TEMPORARILY_UNAVAILABLE`, `INTERNAL_ERROR` 코드로 균질화한다. 카카오 원본 오류나 토큰 값은 클라이언트에 노출하지 않는다.

## Apple 로그인 API

iOS 앱은 가운데 정렬된 Apple 공식 시스템 버튼을 사용하고 이메일·이름 scope를 요청하지 않는다. 버튼은 Apple 인증 시작에만 사용하며 앱은 로그인마다 32바이트 암호학적 nonce를 생성해 Apple 요청과 서버 요청에 같은 값을 사용한다.

```http
POST /v1/auth/apple/exchange
Content-Type: application/json

{
  "idToken": "Apple AuthenticationServices가 발급한 ID Token",
  "nonce": "로그인 요청에 사용한 일회성 nonce"
}
```

- Apple JWKS로 `RS256` 서명을 검증한다.
- issuer는 `https://appleid.apple.com`, audience는 iOS bundle ID `com.loofit.app`이어야 한다.
- `exp`, `iat`, `sub`, `nonce`를 검증하고 `sub`만 내부 identity에 사용한다.
- 이메일·이름·Apple ID Token 원문은 저장하거나 로그에 남기지 않는다.
- 성공 응답은 카카오 로그인과 같은 루핏 Access Token·Refresh Token 계약을 사용한다.
- 잘못된 토큰은 `401 APPLE_LOGIN_REJECTED`, 잘못된 요청은 `400 INVALID_REQUEST`로 균질화한다.

## Refresh Token API

```http
POST /v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<현재 Loofit refresh token>"
}
```

성공 응답은 `user`를 제외하고 소셜 로그인 성공 응답과 같은 새 Access Token·Refresh Token 쌍을 반환한다. 기존 Refresh Token은 조건부 update가 성공하는 즉시 사용할 수 없으며, 만료·폐기·재사용·형식 오류가 있는 토큰은 `401 REFRESH_TOKEN_REJECTED`로 균질화한다. 요청 JSON 자체가 잘못된 경우에는 `400 INVALID_REQUEST`를 반환한다.

앱의 `src/services/auth/native-auth.ts`는 Access Token 만료 60초 전부터 이 API를 호출한다. 회전 토큰의 일회성 특성 때문에 같은 앱 프로세스의 동시 갱신은 하나의 요청으로 합친다. `401`이면 저장된 루핏 세션을 삭제하고 재로그인이 필요한 상태로 전환하며, 네트워크·서버 장애에서는 기존 저장값을 지우지 않는다.

## 로그아웃 API

```http
POST /v1/auth/logout
Content-Type: application/json

{
  "refreshToken": "<현재 Loofit refresh token>"
}
```

서버는 토큰에서 `sessionId`를 파싱한 뒤 저장된 Refresh Token 해시가 정확히 일치하고 아직 폐기·만료되지 않은 세션에 `revokedAt`을 기록한다. 유효한 세션을 폐기했거나 토큰이 이미 만료·폐기·교체된 경우 모두 `204 No Content`를 반환해 세션 존재 여부를 노출하지 않는다. 요청 JSON 자체가 잘못된 경우에는 `400 INVALID_REQUEST`를 반환한다.

앱은 서버 폐기를 시도한 뒤 SecureStore의 루핏 토큰 쌍을 삭제한다. 네트워크·서버 장애가 있어도 현재 기기의 로컬 로그아웃은 완료하며 SQLite 운동 기록과 루틴은 삭제하지 않는다. 이 동작은 provider 계정 연결 해제나 Kakao·Apple 자체 로그아웃을 수행하지 않는다. API Gateway JWT Authorizer가 Access Token 폐기 상태를 조회하지 않으므로 이미 발급된 Access Token은 최장 15분 동안 암호학적으로 유효하지만, 앱이 토큰을 즉시 삭제하고 폐기된 세션에서는 새 Access Token을 갱신할 수 없다.

## 앱 저장 계약

- Kakao·Apple SDK가 발급한 ID Token은 로그인 교환 요청에만 사용하고 SecureStore에 저장하지 않는다.
- 루핏 `userId`, Access Token, Refresh Token과 각 만료 시각을 version 1 JSON 하나로 저장해 토큰 쌍이 부분 갱신되지 않게 한다.
- iOS는 `WHEN_UNLOCKED_THIS_DEVICE_ONLY` 접근성을 사용하고 Android는 SecureStore가 관리하는 암호화 저장소와 백업 제외 규칙을 사용한다.
- 랭킹 탭의 provider CTA가 명시적으로 `signInWithKakao()` 또는 `signInWithApple()`을 호출할 때만 신규 로그인을 시작한다. 로그인 성공 후 운동 기록 백업을 비동기로 시작하되 로그인 성공 자체를 백업 완료까지 지연하지 않는다.
- 설정의 로그아웃은 저장 세션이 있을 때만 표시하고, 확인 후 서버 세션 폐기와 SecureStore 삭제를 수행한다.
- 로컬 SQLite 운동 기록은 로그인 성공 직후와 이후 계약된 mutation·foreground trigger에서만 서버로 전송한다. 토큰 갱신 자체는 동기화를 시작하지 않는다.

## 랭킹 화면 인증 UX

- 랭킹 탭 진입 시 SecureStore 세션을 읽고, 세션이 있으면 `getAccessToken()`으로 만료 60초 전 갱신을 수행한다.
- 세션이 없거나 refresh가 `401`로 거부되면 지원되는 provider 로그인 유도 화면을 표시한다.
- SecureStore 자체를 읽지 못하면 로그인 여부를 추측하지 않고 로그인 상태 확인 실패와 재시도를 표시한다.
- 저장 세션이 있지만 네트워크 장애로 토큰을 갱신하지 못하면 세션을 삭제하지 않고 연결 경고와 함께 로그인 후 화면을 유지한다.
- 로그인 유도 화면의 영업 문구는 provider 중립적으로 작성하고 실제 로그인 버튼만 현재 제공자를 표시한다. 최하단에는 현재 미수집 프로필 항목이나 향후 운동 기록 동기화 범위를 제한하는 문구를 표시하지 않는다.
- 랭킹 조회·집계 API가 없는 현재 단계에서는 로그인 후 내 순위와 전체 랭킹을 `—`와 집계 전 빈 상태로 표시하며, 가짜 사용자·순위를 실제 데이터처럼 렌더링하지 않는다.

## 카카오 운영 설정

카카오 Developers 앱에는 Kakao Login과 OpenID Connect를 활성화하고, 사용할 Redirect URI와 REST API Client Secret을 설정한다. 개인정보 동의 항목은 현재 필요하지 않으며 ID Token의 `sub`만 사용한다.

네이티브 앱만 연결하는 현재 우선 경로에는 Native app key만 필요하다. 웹 REST 흐름을 추가할 때만 REST API key, Client Secret, Redirect URI를 함께 설정한다.

AWS Systems Manager Parameter Store의 `/loofit/production/auth/kakao` SecureString 값은 다음 JSON 계약을 사용한다.

```json
{
  "nativeClientId": "<Kakao Native app key>",
  "rest": {
    "clientId": "<Kakao REST API key>",
    "clientSecret": "<Kakao Client Secret>",
    "redirectUris": ["<exact redirect URI>"]
  }
}
```

`rest` 객체는 선택 사항이다. 현재 네이티브 앱 연결만 할 때는 `{"nativeClientId":"<Kakao Native app key>"}`만 저장한다.

CDK는 이 SecureString을 만들거나 값을 소스에 포함하지 않는다. 카카오 exchange Lambda만 해당 parameter의 `ssm:GetParameter`와 인증 KMS 키의 `kms:Sign`, 사용자 테이블 접근 권한을 가진다. 공개 issuer Lambda는 계속 `kms:GetPublicKey`만 가진다.

## API 경계

최소 로그인 API는 다음 순서로 추가한다.

```text
POST /v1/auth/kakao/exchange
POST /v1/auth/apple/exchange
POST /v1/auth/refresh
GET  /v1/me
```

현재 Kakao·Apple exchange, refresh, logout과 `/v1/me`가 구현되어 있다. `/v1/me`는 JWT Authorizer에 연결한 첫 end-to-end 보호 API다. 로그인과 refresh endpoint는 공개 route이되 별도 rate limit, 입력 검증, 자격 증명 검증, 오류 응답 균질화를 적용한다.
