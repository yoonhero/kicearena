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
