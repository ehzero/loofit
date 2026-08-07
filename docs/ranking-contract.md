# 주간 익명 랭킹 계약

## 목적

랭킹은 운동량을 과도하게 늘리는 경쟁이 아니라 `이번 주의 꾸준함`을 확인하는 기능이다. 로그인한 회원은 별도 참여 절차 없이 자동으로 현재 주 랭킹에 참여하며, 다른 회원에게는 실제 이름이나 소셜 프로필 대신 매주 바뀌는 익명 표시명만 노출한다.

운동 기록의 SSOT는 계속 기기 SQLite다. 랭킹은 서버에 단방향 백업된 완료 기록으로 다시 만들 수 있는 파생 데이터이며 클라이언트가 점수나 순위를 직접 제출하지 않는다.

## 기간

- 시간대: `Asia/Seoul`
- 한 주: 월요일 00:00 이상, 다음 월요일 00:00 미만
- period ID: `WEEK#YYYY-MM-DD` 형식의 해당 주 월요일
- 운동 기록의 주·일 귀속: `startedAt`을 한국시간으로 변환한 날짜
- 미래에 시작한 기록은 현재 집계에서 제외한다.
- 앱은 현재 주만 표시한다. 저장된 파생 항목은 해당 주 종료 90일 후 TTL로 정리한다.

## 집계와 순위

- `completed` 기록만 사용하고 `canceled`와 tombstone은 제외한다.
- 같은 한국시간 날짜의 완료 운동 시간을 합산해 5분 이상이면 `운동한 날` 1일로 인정한다.
- 인정된 날에 속한 완료 기록 수를 `운동 횟수`로 표시한다.
- 동점 기준 운동 시간은 하루 최대 2시간까지만 인정한다.
- 점수는 `운동한 날 × 100,000 + 인정 운동 시간(초)`다. 한 주 최대 인정 시간은 50,400초이므로 운동한 날이 항상 우선한다.
- 같은 점수는 같은 순위이며 순위는 자신보다 높은 점수를 가진 회원 수에 1을 더한 값이다.
- 인정된 날이 하나도 없으면 전체 목록과 내 순위에 노출하지 않는다.
- 기록 추가·수정·삭제·상태 변경은 다음 서버 백업 revision 집계에서 반영한다.

## 익명 표시와 공개 범위

- 표시명은 `SHA-256(period ID + NUL + 내부 userId)` 앞 4자리로 만든 `루핏 XXXX` 형식이다.
- period가 바뀌면 표시명도 바뀐다.
- 본인 행은 앱에서 `나`로 표시한다.
- 다른 로그인 회원에게 공개하는 값은 표시명, 순위, 운동한 날, 운동 횟수, 인정 운동 시간뿐이다.
- 내부 userId, provider, 소셜 이름·이메일·프로필, 운동 부위, 정확한 운동 시각, 분할명과 메모는 API 응답에 포함하지 않는다.
- 로그인 화면은 로그인하면 익명 주간 랭킹에 자동 참여한다는 사실을 액션 전에 안내한다.
- 회원 탈퇴 worker는 모든 기간의 랭킹 항목을 삭제한다.

## 집계 파이프라인

1. 앱의 기존 동기화 worker가 완료·취소 기록의 최신 revision을 사용자 데이터 테이블에 반영한다.
2. batch가 끝나면 `BACKUP#WORKOUTS`의 `backupRevision`이 증가한다.
3. 사용자 데이터 DynamoDB Stream은 키만 랭킹 집계 Lambda에 전달한다.
4. 집계 Lambda는 `BACKUP#WORKOUTS` 변경만 선택하고 사용자의 현재 주 완료 기록을 일관 읽기로 재계산한다.
5. 계산 전후 backup revision이 같을 때만 결과를 사용한다. `ACTIVE` 사용자 조건 확인과 랭킹 쓰기를 단일 transaction으로 실행하고, 랭킹 item의 `sourceRevision` 조건으로 오래된 worker가 최신 결과를 덮어쓰거나 탈퇴 중인 계정의 결과를 다시 만들지 못하게 한다.
6. 인정 기록이 없더라도 score가 없는 marker를 저장해 같은 backup revision을 반복 집계하지 않는다. marker는 `byScore` GSI에 나타나지 않는다.
7. 랭킹 조회 시 현재 주 marker나 item이 없거나 backup revision보다 오래되었으면 현재 사용자만 한 번 재계산해 기존 회원과 배포 직전 기록도 누락하지 않는다.

Stream은 `KEYS_ONLY`를 사용한다. 운동 기록 payload·메모·운동 부위를 집계 이벤트에 복제하지 않는다.

## 저장 모델

`loofit-production-leaderboard`:

| 필드 | 의미 |
| --- | --- |
| `period` | 기본 partition key와 `byScore` partition key |
| `userId` | 기본 sort key와 회원 탈퇴용 `byUser` partition key |
| `score` | `byScore` sort key. 미집계 marker에는 존재하지 않음 |
| `displayName` | 해당 주 익명 표시명 |
| `activeDays` | 운동한 날 수 |
| `workoutCount` | 인정된 날에 속한 완료 기록 수 |
| `totalDurationSeconds` | 일일 cap을 적용한 인정 운동 시간 |
| `sourceRevision` | 계산에 사용한 backup revision |
| `updatedAt` | 마지막 집계 시각 |
| `expiresAt` | 주 종료 90일 후 DynamoDB TTL |

## API

```http
GET /v1/leaderboards/weekly
Authorization: Bearer <Loofit Access Token>
```

- API Gateway JWT Authorizer로 보호한다.
- 상위 50명과 현재 사용자의 순위를 반환한다.
- 현재 사용자가 상위 50명 밖이면 `me`에만 별도로 반환한다.
- 랭킹 GSI는 eventual consistency를 사용하므로 기록 백업 직후 수 초간 이전 결과가 보일 수 있다.
- 응답은 `no-store`이며 앱은 탭 진입과 사용자의 당겨서 새로고침에서 조회한다.

## MVP 제외

- 친구·지역·연령·성별·운동 부위별 랭킹
- 사용자가 작성하는 닉네임·프로필 사진
- 지난주 결과와 시즌 보상
- 실시간 push 갱신
- HealthKit·Health Connect·GPS 기반 운동 증명
- 신고·차단·운영자 제재 화면
