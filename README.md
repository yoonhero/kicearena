# KICE Arena

KICE Arena는 수학 모의고사를 실시간 경쟁 방식으로 푸는 웹 앱이다. 한 문제 집중 풀이 화면, 라이브/프리즈 순위표, 아이템 방해 효과, 시험장 톤의 로그와 UI를 중심으로 설계한다.

## Development

```bash
npm install
npm run dev
```

개발 서버는 기본적으로 다음 주소를 사용한다.

-   Client: `http://localhost:5180/`
-   Server: `http://localhost:3001`

검증 명령:

```bash
npm run build
npm test
```

테스트 위치 규칙:

-   단위 테스트는 대상 파일과 같은 디렉토리에 둔다. 예: `server/scoring.ts` -> `server/scoring.test.ts`.
-   브라우저 흐름을 검증하는 E2E 테스트만 `tests/e2e/*.spec.ts`에 둔다.

## Project Layout

-   `client/src`: React client UI.
-   `server/index.ts`: Express and Socket.IO game server.
-   `shared`: client/server shared game types and pure helpers.
-   `docs`: implementation protocols and contributor-facing notes.
-   `deploy`: deployment and monitoring configuration.
-   `scripts`: exam/problem preparation scripts.
-   `tests/e2e`: Playwright browser-flow tests.
-   `todo.md`: active roadmap and task checklist.

## Contribution Guide

### 1. Read the relevant protocol first

Before changing a subsystem, read the matching notes.

-   UI direction: `DESIGN_NOTES.md`
-   Item additions: `docs/item-protocol.md`
-   Runtime metrics and monitoring: `deploy/monitoring/README.md`
-   Current roadmap: `todo.md`

If a protocol and code disagree, update the protocol or explain why the code is intentionally changing.

### 2. Keep shared contracts authoritative

Shared types in `shared/game.ts` are the contract between server and client. Do not duplicate gameplay rules separately in server and client code when a shared helper or shared type can express the rule.

For item work, follow this order:

1. Add the `ItemId` to `ITEM_IDS`.
2. Add the keyed definition to `ITEM_DEFINITIONS`.
3. Wire server validation and state updates.
4. Wire client affordances and rendering.
5. Run build, tests, and a local usage check.

See `docs/item-protocol.md` for the full item protocol.

### 3. Treat the server as the source of truth

Client UI can guide users, but gameplay authority belongs on the server.

-   Validate room status, player identity, inventory, target eligibility, duplicate effects, cooldowns, and payload limits on the server.
-   Only mutate inventory or score after all validation passes.
-   Keep effects, expired effects, cooldowns, submissions, and scoreboard reveal state consistent in emitted room state.

### 4. Preserve existing UX direction

The app should feel like a competitive live mock exam, not a generic dashboard.

-   Keep the solving view focused on one large problem page.
-   Keep ranking and contest analysis on dedicated ranking/result screens.
-   Prefer compact exam-administration labels over explanatory marketing copy.
-   Avoid unrelated redesigns while working on gameplay logic.
-   Check mobile and desktop layouts when adding overlays, target banks, buttons, or long Korean labels.

### 5. Keep changes scoped

Make the smallest coherent change that solves the task.

-   Do not revert unrelated dirty files.
-   Do not mix unrelated roadmap work into one patch.
-   If a file already has user changes, preserve them and edit only the necessary lines.
-   Update `todo.md` only for work that is actually implemented and verified.

### 6. Verify before marking work done

For most code changes, run:

```bash
npm run build
npm test
```

For frontend/gameplay changes, also run the local app and manually check the affected flow in a browser. For example:

-   Room creation and join.
-   Answer submission.
-   Item award, target selection, use, active state, cooldown, and expiry.
-   Scoreboard freeze/reveal behavior when touched.
-   Mobile-width layout if UI controls or overlays changed.

If a check cannot be run, state that explicitly in the handoff.

### 7. Review standard

When reviewing changes, prioritize:

1. Gameplay correctness and server-side trust boundaries.
2. Shared contract drift between `shared`, `server`, and `client`.
3. Missing cleanup/recovery behavior for temporary state.
4. UI states that can overlap, disappear, or become unusable on small screens.
5. Missing tests or manual verification for touched workflows.

Summaries are secondary; findings should identify the concrete file and line that can break behavior.

## Documentation Rules

Add or update docs when a change creates a repeatable protocol, a subsystem contract, or a new verification checklist. Keep docs operational: contributors should be able to follow the document while making the next change.
