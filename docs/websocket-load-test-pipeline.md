# WebSocket Load Test Pipeline

이 문서는 KICE Arena의 Socket.IO 동시접속 한계를 재는 운영 파이프라인 설계다. 목표는 단순 TCP 접속 수가 아니라 실제 게임 흐름에서 서버가 어느 지점까지 안정적으로 `room:update`를 브로드캐스트하고 ACK 기반 이벤트를 처리하는지 측정하는 것이다.

## Scope

KICE Arena는 Socket.IO 서버다. 따라서 기본 WebSocket 부하 도구만으로는 Socket.IO의 Engine.IO 핸드셰이크, 이벤트 인코딩, ACK, 룸 브로드캐스트 비용을 정확히 재기 어렵다. 주 테스트 도구는 Socket.IO 프로토콜을 직접 지원하는 Artillery를 사용하고, Python 기반 분산 부하와 커스텀 load shape가 필요할 때 Locust를 보조로 둔다.

현재 앱 레벨 가드레일은 `shared/game.ts` 기준 방당 60명, 활성 방 200개다. 즉 앱 정책상 최대 참가자 수는 12,000명이며, 테스트는 다음 두 가지를 분리해서 본다.

- `capacity`: 앱 정책 상한에 도달하기 전 시스템 병목이 나는지 확인한다.
- `guardrail`: 12,000명 이후 방 생성/입장이 명확하게 거절되고 기존 세션이 안정적인지 확인한다.

## Tooling

### Primary: Artillery

Artillery의 Socket.IO 엔진은 `engine: socketio`, `emit`, ACK 검증, `transports: ["websocket"]` 설정을 지원한다. 이 앱의 기본 경로 `/socket.io`와 ACK 콜백 기반 이벤트에 잘 맞는다.

권장 이유:

- Node 생태계라 현재 프로젝트와 의존성/CI 통합이 단순하다.
- `socket.io.emit`, `socketio.response_time.*`, emit rate 같은 Socket.IO 전용 지표를 바로 낸다.
- YAML 시나리오로 smoke, ramp, soak를 쉽게 분리할 수 있다.

### Secondary: Locust

Locust는 HTTP 외 프로토콜을 커스텀 클라이언트로 확장할 수 있고, 현재 문서 기준 `SocketIOUser`가 있다. 다만 SocketIO 지원은 experimental로 표시되어 있으므로, 메인 판정 도구보다는 긴 soak, 분산 worker, 커스텀 ramp shape, Python 기반 결과 후처리에 사용한다.

프로젝트 규칙상 Python 스크립트와 Locust 실행은 다음처럼 `mlenv`에서 한다.

```bash
conda run -n mlenv locust -f load/locust/socketio_load.py --headless -H http://127.0.0.1:3001 -u 1000 -r 50 --run-time 10m
```

### Tertiary: k6 or raw ws tools

k6의 기본 WebSocket API는 RFC WebSocket 연결과 메시지 측정에는 좋지만 Socket.IO 이벤트/ACK를 그대로 이해하지 않는다. 따라서 이 앱에서는 다음 용도로만 쓴다.

- reverse proxy, TLS, OS file descriptor, network path의 순수 연결 한계 확인
- Socket.IO가 아니라 raw `ws://...`로 바꿨을 때의 기준선 비교

## Test Environment

부하 테스트는 개발 서버가 아니라 production 형태로 실행한다.

```bash
npm run build
METRICS_BEARER_TOKEN=loadtest NODE_ENV=production PORT=3001 npm start
```

관측은 Prometheus/Grafana를 켠다.

```bash
METRICS_BEARER_TOKEN=loadtest docker compose up -d prometheus grafana
```

OS 한계도 테스트 시작 전에 고정한다.

```bash
ulimit -n 65535
sysctl kern.maxfiles
sysctl kern.maxfilesperproc
```

원격 부하 발생기를 쓰는 경우 앱 서버와 부하 발생기를 같은 호스트에 두지 않는다. 같은 머신에서 돌리면 서버 한계와 부하 발생기 한계가 섞인다.

## Scenarios

### 1. Connect-only smoke

목적: Socket.IO 핸드셰이크와 연결 유지 비용만 측정한다.

흐름:

1. connect
2. 60초 idle
3. disconnect

합격 기준:

- 연결 실패율 0.1% 이하
- `kice_arena_socket_connections`가 목표치와 일치
- idle 상태에서 RSS와 event loop lag가 계속 증가하지 않음

### 2. Lobby fan-in

목적: 방 생성과 입장 ACK 처리, `room:update` 브로드캐스트 비용을 측정한다.

흐름:

1. host user가 `room:create`를 emit하고 ACK의 `data.code`, host `player:you`를 저장한다.
2. worker users가 공유된 room code로 `room:join`을 emit한다.
3. 60명 단위로 새 방을 만든다.
4. 각 join 이후 `room:update` 수신 여부를 확인한다.

합격 기준:

- 방당 60명까지 `room:join` ACK 성공
- 61번째 join은 정상 거절
- `kice_arena_players{state="connected"}`와 `kice_arena_socket_connections`가 실제 부하 수와 일치
- p95 ACK latency 500ms 이하, p99 1500ms 이하

### 3. Playing steady-state

목적: 실제 게임 중 답안 제출, 문제 이동, 순위 계산, 브로드캐스트를 측정한다.

흐름:

1. 방별 1 host + 59 participants 입장
2. host가 `room:start`
3. 각 participant가 5-20초 간격으로 `problem:set`
4. 각 participant가 10-30초 간격으로 `answer:submit`
5. 10분 유지

합격 기준:

- `answer:submit` ACK 실패율 1% 이하
- 서버가 rate limit으로 거절한 요청은 별도 카운트하고 실패율에서 분리
- `kice_arena_answers_submitted_total` 증가율이 부하 모델과 대략 일치
- CPU가 장시간 85% 이상 고정되지 않음
- RSS가 테스트 종료 후 안정화되거나 감소

### 4. Burst and reconnect

목적: 실제 접속 폭증과 네트워크 흔들림을 재현한다.

흐름:

1. 30초 동안 목표 동시접속의 50%를 생성
2. 60초 유지
3. 20%를 강제 disconnect
4. 같은 `playerId`로 `room:rejoin`
5. 나머지 50%를 추가 생성

합격 기준:

- rejoin ACK 성공률 99% 이상
- 연결 끊김 후 `players{state="disconnected"}`가 증가하고 rejoin 후 감소
- 기존 방의 `room:update`가 멈추지 않음

### 5. Soak

목적: cleanup, ping/pong, 메모리 누수를 확인한다.

흐름:

1. 목표치의 50-70% 동시접속으로 2-6시간 유지
2. 낮은 빈도의 `problem:set`, `answer:submit`, idle 혼합
3. 일부 방은 종료, 일부 방은 로비 유지

합격 기준:

- event loop lag와 RSS가 선형 증가하지 않음
- finished/lobby TTL 이후 room cleanup이 작동
- ping timeout으로 인한 비정상 대량 disconnect가 없음

## Ramp Plan

초기 기준은 다음 단계로 잡는다. 한 단계라도 실패하면 다음 단계로 가지 않고 병목을 기록한다.

| Stage | Rooms | Participants | Duration | Purpose |
| --- | ---: | ---: | ---: | --- |
| Smoke | 2 | 120 | 5m | 시나리오와 메트릭 검증 |
| Small | 10 | 600 | 10m | 단일 프로세스 안정성 |
| Medium | 50 | 3,000 | 15m | 브로드캐스트/ACK 병목 탐색 |
| Guardrail | 200 | 12,000 | 15m | 앱 정책 상한 검증 |
| Overflow | 210+ | 12,600+ | 5m | 초과 요청 정상 거절 검증 |
| Soak | 100 | 6,000 | 2-6h | 누수/cleanup 확인 |

## Metrics

앱 메트릭:

- `kice_arena_socket_connections`
- `kice_arena_players{state="connected|disconnected|total"}`
- `kice_arena_rooms_active`
- `kice_arena_rooms_by_status`
- `kice_arena_rooms_created_total`
- `kice_arena_players_joined_total`
- `kice_arena_answers_submitted_total{correct="true|false"}`
- `kice_arena_http_request_duration_seconds`
- Node default metrics under `kice_arena_`

부하 도구 메트릭:

- connect success/failure
- ACK latency by event: `room:create`, `room:join`, `room:start`, `answer:submit`, `room:rejoin`
- messages received per virtual user
- disconnect reason
- generator CPU/RSS/network usage

추가 계측 권장:

- Node event loop lag histogram
- Socket.IO event duration histogram
- `room:update` emitted counter and payload size histogram
- ACK timeout counter by event

## Artillery Pipeline Skeleton

파일 위치는 `load/artillery/socketio.yml`을 권장한다.

```yaml
config:
  target: "http://127.0.0.1:3001"
  phases:
    - name: ramp
      duration: 300
      arrivalRate: 10
      rampTo: 200
    - name: steady
      duration: 600
      arrivalRate: 200
  socketio:
    transports: ["websocket"]
  processor: "./socketio-processor.cjs"

scenarios:
  - name: kice playing flow
    engine: socketio
    flow:
      - function: "assignRoom"
      - emit:
          - "room:join"
          - code: "{{ roomCode }}"
            nickname: "{{ nickname }}"
        acknowledge:
          match:
            json: "$.ok"
            value: true
      - think: 1
      - loop:
          - function: "pickProblemAndAnswer"
          - emit:
              - "problem:set"
              - problemId: "{{ problemId }}"
          - think: 2
          - emit:
              - "answer:submit"
              - problemId: "{{ problemId }}"
                answer: "{{ answer }}"
            acknowledge:
              match:
                json: "$.ok"
                value: true
          - think: 10
        count: 20
```

별도 setup 단계에서 host rooms를 만든 뒤 room code pool을 Redis, 파일, 또는 Artillery processor 메모리에 공급한다. 큰 테스트에서는 방 생성과 참가자 입장을 같은 scenario에 섞지 말고, `setup-rooms`와 `load-participants` 두 job으로 나눈다.

## Locust Pipeline Skeleton

파일 위치는 `load/locust/socketio_load.py`를 권장한다.

```python
from locust import task, between
from locust.contrib.socketio import SocketIOUser


class KiceSocketUser(SocketIOUser):
    wait_time = between(5, 20)

    def on_start(self):
        self.room_code = self.environment.parsed_options.room_code
        self.nickname = f"u{self.environment.runner.user_count}"
        self.connect(self.host, transports=["websocket"])
        self.emit("room:join", {"code": self.room_code, "nickname": self.nickname}, callback=self.on_join_ack)

    def on_join_ack(self, response):
        if not response.get("ok"):
            raise RuntimeError(response.get("error", "join failed"))
        self.room = response["data"]
        self.problem_id = self.room["exam"]["problems"][0]["id"]

    @task
    def submit_answer(self):
        if not getattr(self, "problem_id", None):
            return
        self.emit("answer:submit", {"problemId": self.problem_id, "answer": "1"})
```

실행 예:

```bash
conda run -n mlenv locust -f load/locust/socketio_load.py \
  --headless -H http://127.0.0.1:3001 \
  -u 3000 -r 100 --run-time 15m \
  --csv reports/load/locust-medium
```

## CI/CD Integration

PR마다 대규모 부하 테스트를 돌리면 비용과 시간이 크다. 단계별로 나눈다.

- PR smoke: 2 rooms, 120 users, 2-5분. 실패하면 merge 차단.
- Nightly medium: 50 rooms, 3,000 users, 15분. 회귀 알림.
- Release candidate: 200 rooms, 12,000 users, 15분 + overflow. 릴리스 게이트.
- Monthly soak: 6,000 users, 2-6시간. 누수와 cleanup 검증.

각 job 산출물:

- Artillery/Locust JSON or CSV report
- Prometheus snapshot
- app logs
- generator host metrics
- 판정 요약: max stable concurrent sockets, p95/p99 ACK latency, failure rate, peak RSS, peak CPU

## Failure Triage

결과 해석 순서는 고정한다.

1. 부하 발생기 CPU/RSS/socket limit이 먼저 찼는지 확인한다.
2. 앱 서버 `socket_connections`가 목표치까지 갔는지 확인한다.
3. ACK timeout이 특정 이벤트에 몰리는지 확인한다.
4. `room:update` payload size와 브로드캐스트 횟수가 폭증하는지 확인한다.
5. 메모리 증가가 room/player cleanup 이후 회복되는지 확인한다.
6. reverse proxy를 쓰는 배포라면 sticky session, WebSocket upgrade, idle timeout을 확인한다.

## References

- Locust docs: https://docs.locust.io/
- Locust other protocols and SocketIO note: https://docs.locust.io/en/stable/testing-other-systems.html
- Artillery Socket.IO engine: https://www.artillery.io/docs/reference/engines/socketio
- Grafana k6 WebSocket API: https://grafana.com/docs/k6/latest/javascript-api/k6-ws/socket/
