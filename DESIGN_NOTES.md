# KICE Arena Design Notes

## 2026-06-03 UI Direction

- Core mood: make the app feel like a live competitive mock exam, not a generic game dashboard.
- Primary solving view: show one problem large on a white exam-paper surface, with KICE-style header cues such as school year, period, subject area, type badge, and problem number.
- Entrance and lobby: frame the user as entering an exam room. Use room code, examinee list, and rule briefing instead of marketing-style hero copy.
- Scoring: follow a DOMjudge-like model where accepted submissions are scored at the solve time. Earlier solves receive a larger time bonus, and harder problems receive a difficulty bonus.
- Ranking: keep a live ranking during most of the contest, then freeze the visible scoreboard 10 minutes before the end. After freeze, each player can still see their own actual score while competitors' visible ranks remain frozen.
- Competitive tone: make competition legible and fun with live/frozen badges, accepted count, score breakdown, item inventory, and proctor-style logs.
- Visual language: paper, black ink, simple ruled borders, restrained highlight colors for live status, freeze status, correct solves, and warnings.
- Avoid splitting the entrance into separate card-like regions. The room creation and join inputs should sit inside the exam cover as a natural slip/answer-sheet area, using underlined fields rather than boxed panels.
- Remove explanatory copy when the same idea is already visible through layout, labels, ranking state, or scoring feedback.
- Main entrance should have no decorative page background. Treat the whole viewport as one exam surface.
- Entrance fields should feel like OMR/answer-sheet writing: underlined fields, circular number bubbles, and compact exam-administration labels.
- Solving view should prioritize one immersive problem page. Ranking, logs, and competition analysis should live on a separate scoreboard view rather than beside the problem.
- Problem navigation should communicate crowd progress through gray fill percentage per problem, with the current problem and personal solves using stronger marks.
- Scoreboard should use a DOMjudge-like grid: player rows, problem columns, accepted time, and attempt count.

## 2026-06 Visual Balance Rule

- One page should have one dominant visual job. Entrance screens collect identity and room intent, solving screens show one problem, reveal screens track rank movement, and report screens read like a final document.
- Reduce content entropy before adding decoration. Dense controls must be grouped by workflow, with quiet separators and stable spacing instead of competing cards, shadows, or badges.
- Exam motifs are structural, not decorative. OMR marks, stamps, paper covers, and ruled lines must support the current task and must never overlap primary controls, tables, or report titles.
- Use one main UI accent: `--ui-accent: #2f6473`. Apply it to selected controls, focus affordances, compact active states, and timing controls.
- Keep color roles narrow: red is for grading marks, stamps, and errors; green is for correctness/success; yellow is for reveal/live emphasis. Avoid introducing extra accent families on the entrance page.
