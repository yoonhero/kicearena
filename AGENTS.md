1. 단위 테스트는 대상 파일과 같은 디렉토리에 둔다. 예: `server/scoring.ts`의 테스트는 `server/scoring.test.ts`, `shared/runtimeMetrics.ts`의 테스트는 `shared/runtimeMetrics.test.ts`에 둔다.
2. 브라우저 흐름을 검증하는 E2E 테스트만 `tests/e2e/*.spec.ts`에 둔다.
