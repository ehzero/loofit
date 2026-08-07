# 운동 기록 단방향 백업과 명시적 복원 계약

## 목적과 권한

운동 기록의 SSOT는 기기 SQLite다. 서버는 로그인한 사용자의 운동 기록을 보관하는 단방향 복제본이며, 일반 앱 동작에서 서버 데이터가 로컬 기록을 덮어쓰거나 자동 병합하지 않는다. 서버 데이터의 로컬 반영은 설정에서 사용자가 `백업에서 기록 가져오기`를 확인한 경우에만 수행하는 명시적 복원 예외다.

동기화 실패는 운동 완료·수정·삭제와 로그인 성공을 실패로 바꾸지 않는다. 로컬 mutation과 동기화 outbox 작성만 같은 SQLite transaction에서 보장하고 네트워크 전송은 transaction commit 이후 수행한다.

## 데이터 범위

서버에는 `completed`와 `canceled` 운동 기록을 계정이 유지되는 동안 저장한다. `active` 세션은 서버에 저장하지 않는다.

저장 필드:

- 로컬 생성 `syncId`와 단조 증가하는 `syncVersion`
- 완료·취소 상태
- 시작·종료 시각과 운동 시간
- 분할명 snapshot
- 운동 부위명·색상·정렬 snapshot
- 메모
- 로컬 생성·수정 시각

로컬의 정수 session·routine·body part ID, 현재 루틴 설정, 다음 운동 위치, 테마·위젯 설정은 전송하지 않는다.

## 로컬 스키마와 outbox

DB version 2는 `workout_sessions.sync_id`, `workout_sessions.sync_version`, `workout_sync_outbox`, `cloud_backup_state`를 추가한다. 기존 완료·취소 기록은 migration에서 `syncId`와 version 1을 부여하고 `UPSERT` outbox에 넣는다.

SQLite trigger가 모든 TypeScript·Swift·Kotlin 쓰기 경로에 동일한 규칙을 적용한다.

- active 세션 생성: `syncId`만 지정하고 outbox를 만들지 않는다.
- 완료·취소: version을 증가시키고 `UPSERT`를 기록한다.
- 완료·취소 기록 편집: version을 증가시키고 기존 outbox를 최신 `UPSERT`로 교체한다.
- 완료·취소 기록을 active로 다시 열기: version을 증가시키고 `DELETE`를 기록한다.
- 기록 삭제: 로컬 행을 제거하면서 더 높은 version의 `DELETE`를 남긴다.

같은 기록을 오프라인에서 여러 번 편집하면 중간 version을 보낼 필요 없이 최신 outbox 하나만 유지한다.

## dataset과 계정 연결

각 로컬 DB는 32자리 무작위 hex `datasetId`를 가진다. 최초 동기화 시 내부 `userId`에 바인딩하고 로그아웃 후에도 바인딩을 유지한다.

- 같은 사용자 재로그인: pending outbox 동기화 재개
- 다른 사용자 로그인: 로컬에서 차단하고 기록을 전송하지 않음
- 서버에 다른 `datasetId`가 이미 연결된 사용자: 업로드 전에 백업 metadata를 확인해 자동 업로드를 중단하고 설정에 복원 진입점을 표시
- 로컬·서버 `datasetId`가 같은 사용자: 설정에 마지막 백업 시각만 표시하고 복원 액션은 노출하지 않음
- 같은 사용자의 다른 dataset 복원: 명시적 병합이 완료되면 로컬 dataset을 서버 dataset으로 변경하고 로컬에만 있는 기록을 outbox로 업로드
- 다른 사용자 계정: 로컬에서 차단하고 자동 이전·병합하지 않음
- 회원 탈퇴: 서버 backup·기록·tombstone을 모두 삭제하지만 로컬 dataset의 기존 사용자 바인딩은 유지
- 탈퇴 후 재가입: 새 내부 사용자로 취급하고 기존 dataset을 자동 이전하거나 업로드하지 않음

## 실행 시점

동기화는 다음 시점에만 실행한다.

- Kakao·Apple 로그인 성공 직후
- 운동 완료·취소 후
- 완료·취소 기록 편집·삭제 후 1.5초 debounce
- 앱 시작과 foreground 복귀
- 외부 위젯·알림 운동 명령을 앱이 확인한 뒤
- foreground에서 실패한 요청의 지수 backoff 재시도

랭킹 탭 진입과 로그아웃 직전에는 별도 동기화를 실행하지 않는다. 로그아웃 상태의 변경은 outbox에 남고 동일 사용자가 다시 로그인하면 전송한다. iOS·Android background execution에 의존하지 않으며 background 진입 시 재시도 timer를 중단한다.

재시도 간격은 `2초 → 5초 → 15초 → 30초 → 1분 → 최대 5분`이고 한 번에 최대 50개 operation을 보낸다. 한 프로세스에서는 worker 하나만 실행한다.

## 서버 API와 저장 모델

JWT Authorizer로 보호한 API:

```http
POST /v1/workouts/sync
Authorization: Bearer <Loofit Access Token>
Content-Type: application/json
```

요청은 `datasetId`와 최대 50개의 `UPSERT`·`DELETE` operation을 포함한다. 서버 item:

| entity | `pk` | `sk` |
| --- | --- | --- |
| dataset 상태 | `USER#<userId>` | `BACKUP#WORKOUTS` |
| 운동 기록·tombstone | `USER#<userId>` | `WORKOUT#<syncId>` |

서버는 저장된 `syncVersion`보다 큰 요청만 적용한다. 같은 version은 멱등 성공, 더 낮은 version은 현재 server version과 함께 conflict로 반환한다. 앱은 로컬 payload를 유지한 채 server version보다 큰 새 revision으로 올려 다시 보내므로 로컬 SSOT가 최종 승자가 된다.

`DELETE`는 운동 payload를 제거하고 `syncId`, version, 삭제 시각만 있는 tombstone으로 교체한다. tombstone은 오래된 요청의 부활을 막기 위해 TTL 없이 유지한다. 회원 탈퇴 worker는 현재 기록과 tombstone을 모두 삭제한다.

업로드 batch를 모두 처리한 뒤 dataset 상태의 `backupRevision`을 증가시키고 `updatedAt`을 갱신한다. 복원은 다운로드 전후 revision이 같을 때만 적용한다.

## 서버 백업 조회와 복원

JWT Authorizer로 보호한 읽기 API:

```http
GET /v1/workouts/backup
GET /v1/workouts/backup/records?cursor=<opaque cursor>
Authorization: Bearer <Loofit Access Token>
```

metadata는 백업 존재 여부, `datasetId`, `backupRevision`, 마지막 백업 시각을 반환한다. records API는 같은 사용자의 `WORKOUT#` item을 일관 읽기로 최대 100개씩 반환하며 기록과 tombstone을 모두 포함한다.

앱은 진행 중 운동이 없을 때 모든 page를 메모리에 내려받고 dataset·revision·중복 `syncId`·payload를 검증한다. 네트워크 실패나 revision 변경이 있으면 로컬 DB에 아무것도 적용하지 않는다. 검증이 끝나면 SQLite 단일 transaction으로 다음 규칙을 적용한다.

- 서버에만 있는 기록: `syncId`와 version을 보존해 로컬 과거 기록으로 추가
- 같은 `syncId`: 높은 version을 적용하고 version이 같으면 로컬 유지
- 서버 tombstone version이 로컬 이상: 로컬 기록 삭제
- 로컬 version이 더 높거나 로컬에만 있는 기록: 유지하고 `UPSERT` outbox 등록
- 서로 다른 `syncId`: 날짜·이름 기반 중복 추정을 하지 않음

새로 복원한 기록은 로컬 정수 routine·day·body part ID를 만들지 않고 저장된 분할·운동 부위 snapshot으로 기록 목록·히트맵·대시보드에 표시한다. 기존 루틴 연결과 다음 운동 위치는 변경하지 않는다. 서버 백업으로 로컬 전체 교체, 자동 다중 기기 동기화, 다른 사용자 계정 병합은 현재 범위에 포함하지 않는다.

## 오류와 관측성

- `401`: 인증 세션을 다시 확인하고 로그인되지 않은 상태에서는 재시도하지 않는다.
- 탈퇴 처리 중인 사용자의 기존 Access Token으로 보낸 쓰기는 profile의 `ACTIVE` 조건 검사에서 거부한다.
- `409 WORKOUT_SYNC_DATASET_MISMATCH`: 자동 재시도하지 않는다.
- 요청 데이터 `4xx`: outbox를 유지하되 자동 재시도하지 않는다.
- `429`, 네트워크 오류, `5xx`: foreground 지수 backoff로 재시도한다.
- 성공 응답은 요청의 모든 `syncId + version`을 포함해야 하며 누락·중복 응답은 적용하지 않는다.
- Lambda와 API 로그에는 운동 payload·메모·토큰을 남기지 않는다.

현재 구현은 단방향 업로드와 사용자가 확인하는 병합 복원까지 담당한다. 자동 다중 기기 동기화, 계정 전환, 서버 백업으로 로컬 전체 교체, 랭킹 파생 집계는 후속 범위다.
