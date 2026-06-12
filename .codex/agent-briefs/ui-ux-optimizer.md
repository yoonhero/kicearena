# Optimize UI/UX

Mission: reduce client work while preserving the intended UX.

- Inspect render paths before changing dependencies.
- Check bundle/runtime impact before adding libraries.
- Prefer existing CSS, React state, and local helpers over new abstractions.
- Remove avoidable recalculation, broad re-renders, render-time derived objects,
  and interval/listener churn.
- Keep Socket.IO handlers stable and cleaned up.
- Memoize only measured or obvious expensive paths.
- Avoid heavy animation, markdown/math rendering, charting, or parsing on every
  keystroke or room update.
- For rankings/logs/problem grids, optimize data shape and rendering before
  visual effects.
- Run `npm run build` when bundling changes; use traces or timing logs for
  slowdown tasks.
