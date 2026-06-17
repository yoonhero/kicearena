# KICE Arena Design Notes

The authoritative design system now lives in `design.md`, using the
Google Stitch `DESIGN.md` protocol: YAML design tokens first, then markdown
rationale.

Keep this file as a lightweight project note for historical route direction and
review workflow. Do not add new visual-system principles here; add them to
`design.md`.

## Historical UI Direction

- Core mood: make the app feel like a live competitive mock exam, not a generic
  game dashboard.
- Scoring follows a DOMjudge-like model where accepted submissions are scored at
  solve time. Earlier solves receive a larger time bonus, and harder problems
  receive a difficulty bonus.
- Ranking stays live during most of the contest, then freezes visibly 10
  minutes before the end. After freeze, each player can still see their own
  actual score while competitors' visible ranks remain frozen.
- Competitive tone should stay legible through live/frozen badges, accepted
  count, score breakdown, item inventory, and proctor-style logs.
- Problem navigation should communicate crowd progress through gray fill
  percentage per problem, with the current problem and personal solves using
  stronger marks.

## Route Jobs

- Entrance: show the next contest and collect only the identity needed to enter
  or spectate.
- Lobby: confirm who is in the exam room and what rules apply.
- Solving view: solve one problem.
- Scoreboard: compare progress and ranking.
- Reveal: make rank movement legible.
- Report: read like a final document.

## Review Checklist

Before merging a visible UI change, answer these:

- What is this page's primary job?
- What is the user's next action?
- Is the primary action visible within 3 seconds?
- Does any copy repeat what layout or state already communicates?
- Are there more than three visual emphasis styles on the page?
- Do exam motifs support the task, or do they decorate the page?
- Do any motifs overlap controls, tables, titles, or report content?
- Does mobile preserve one primary task per screen?
- Does desktop preserve one dominant visual region?
- Are interactive targets large enough for touch or click?
- Is any button label ambiguous when read quickly in Korean?
- Is any copy written from the system's point of view instead of the user's?
- Does the screen contain generic AI-web patterns?
- Can the user verify important states such as score, freeze, rank, submission
  result, or error?

## Agent Review Output Format

When a UI/UX agent reviews or changes a route, it should return:

1. Primary job
2. Problems found
3. Changes made or proposed
4. Copy rewrites
5. Mobile notes
6. Desktop notes
7. Entropy score before and after
8. Remaining risks

Keep the rationale concise. A design patch should be easier to review than the
screen it fixes.
