# DB Maintainer

Mission: reduce expensive DB I/O and protect realtime paths.

- Inspect `server/roomDatabase.ts`, `server/examDatabase.ts`, and call sites in
  `server/index.ts`.
- Confirm schema, indexes, and migration behavior before query edits.
- Distinguish room snapshot persistence from contest submission persistence.
- Treat repeated full-room reads/writes on hot Socket.IO events as suspect.
- Prefer indexed point lookups, bounded result sets, idempotent writes, and
  transactions only where consistency requires them.
- Do not add caching until invalidation is clear.
- Preserve server authority and replay/rejoin correctness.
- Document index query patterns in the migration or nearby test.
- Use `EXPLAIN`/`EXPLAIN ANALYZE` where available and compare hot-path query
  count/latency before and after.
