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

## 2026-06-12 Low-Entropy Design Principle

Design is the removal of unnecessary interpretation between the user's intent and the next correct action.

In Korean product copy: 디자인은 사용자의 의도와 다음 행동 사이에 끼어든 불필요한 해석을 제거하는 일이다.

KICE Arena should feel direct, legible, and exam-room precise. The interface should not explain itself with marketing language. It should make the user's next action visible through layout, scale, labels, state, and consequence.

A design change is good only if it improves at least one of these:

- The user knows the next action faster.
- The user makes fewer interpretation errors.
- The current state becomes clearer.
- The user reads less copy for the same confidence.
- The user can verify, recover, or continue more easily.
- The layout becomes more stable across mobile and desktop.

A design change is bad if it only does one of these:

- It sounds more impressive.
- It adds a familiar AI-generated web pattern.
- It repeats an already visible feature.
- It humanizes the system without need.
- It makes the page look richer while making the task less direct.

## Intuitive Design Rules

The interface must answer three questions within roughly 3 seconds:

1. Where am I?
2. What can I do next?
3. What happens if I do it?

Use visual hierarchy before explanatory text. A primary action should be obvious from position, size, grouping, contrast, and state. Do not rely on a paragraph to explain which button matters.

Use real-world exam metaphors only when they clarify the workflow. An OMR field is useful when the user is entering identity or selecting an answer. A decorative stamp is not useful if it competes with a submit button, timer, rank table, or report title.

## Content Density Rules

Density is not the enemy. Unstructured density is the enemy.

Mobile:

- One primary task per screen.
- One primary action per decision point.
- Avoid dense side-by-side panels.
- Reveal secondary information progressively.
- Keep touch targets at least 44px when possible; prefer 48px for touch-first controls.
- Avoid burying the primary action below decorative copy.

Desktop:

- One dominant visual region per page.
- Secondary regions may exist, but they must not compete with the main task.
- Solving screens should keep the problem page dominant.
- Ranking, logs, and analysis belong in the scoreboard route unless they are essential to solving.
- Tables may be dense when they are structured like contest or exam records.

## Minimalism and Entropy Rules

Minimalism here does not mean empty. It means every visible element must pay rent.

Before adding a badge, card, icon, tooltip, shadow, gradient, paragraph, or animation, ask:

- Does this reduce user uncertainty?
- Does this show a state that is not already visible?
- Does this help the user act, verify, or recover?
- Would removing it reduce task success?

If the answer is no, remove it.

Use this entropy formula during review:

```text
entropy =
  2.0 * redundant_copy_count
+ 2.0 * ambiguous_cta_count
+ 1.5 * decorative_badge_count
+ 1.5 * competing_card_region_count
+ 1.5 * unrelated_accent_color_count
+ 1.0 * generic_ai_phrase_count
+ 1.0 * unnecessary_icon_count
+ 2.0 * overlap_or_alignment_risk_count
+ 2.0 * user_goal_mismatch_count
```

The goal is not to remove all visual density. The goal is to remove density that does not support the user's current task.

## Korean Copywriting Rules

Write from the user's action and consequence, not from the implementation.

Good copy tells the user what they can do or what will happen. Bad copy repeats the product requirement, internal feature name, or developer's mental model.

Rules:

- Prefer concrete verbs over feature nouns.
- Prefer user-visible consequences over implementation descriptions.
- Avoid ambiguous Korean compounds, especially button labels that collapse into another word.
- Do not write as if the system is a person unless error handling truly needs it.
- Avoid first-person system language in normal UI.
- Keep primary CTA labels short, usually 2 to 5 Korean words.
- A CTA should contain or imply an action verb.
- Avoid English jargon unless the target users already expect it.
- Do not praise the user or add fake warmth in operational flows.

Examples:

| Bad | Problem | Better |
| --- | --- | --- |
| `모의고사 한 장 · DOMjudge식 실시간 순위` | Repeats the concept and uses internal contest jargon. | `문제를 풀고 순위를 확인하세요` |
| `모의고사 한 장 · DOMjudge식 실시간 순위` | Too feature-driven for a landing or entrance action. | `빠르게 맞힐수록 점수가 올라갑니다` |
| `감독관으로 방 열기` | Can visually collapse into `방열기`; role and action are awkwardly fused. | `시험실 만들기` |
| `감독관으로 방 열기` | Sounds like an internal mode rather than a user action. | `감독 모드 시작` |
| `한 화면에 한 문항을 크게 띄우고...` | Describes what the system does instead of what the user experiences. | `한 문항씩 풉니다. 빨리 맞힐수록 시간 점수가 붙습니다.` |
| `종료 10분 전에는 순위표가 멈추고 마지막 역전은 답안지 안에서만 진행됩니다.` | Dramatic but indirect. | `종료 10분 전부터 공개 순위가 고정됩니다.` |

Preferred forms:

- `시험실 만들기`
- `시험실 입장`
- `답안 제출`
- `다음 문항`
- `순위 확인`
- `공개 순위는 종료 10분 전 고정됩니다`
- `빠르게 맞힐수록 점수가 높습니다`

Avoid forms:

- `AI 기반`
- `실시간 경험`
- `몰입형 경쟁 플랫폼`
- `DOMjudge식` in user-facing copy, unless the page is for contest-experienced operators
- `감독관으로 방 열기`
- `문제를 한 화면에 크게 띄웁니다`

## Anti-LLM-Smell Rules

Do not let KICE Arena look or sound like a generic AI-generated website.

Avoid:

- Generic hero slogans.
- Repeated three-step card sections.
- Decorative blinking dots.
- Arbitrary monospace styling.
- Over-polished gradient cards.
- “X is the Y of Z” copy.
- “Not just X, but Y” copy.
- Punchline-style final sentences that try to sound profound.
- Fake warmth such as “좋은 질문이에요” or “무엇이든 도와드릴게요” in product UI.
- Humanized AI or system copy when the product needs a precise instrument.

Use instead:

- Exam administration language.
- Direct task labels.
- Visible state.
- Tables where tables are the clearest structure.
- Short copy close to the relevant control.
- Checkable scoring and ranking details.

AI or system-generated content should behave like a reliable instrument:

- Direct.
- Bounded.
- Checkable.
- Honest about uncertainty.
- Easy to correct or retry.

## Page-Level Notes

### Entrance

Primary job: collect room intent and identity.

- Treat the viewport as one exam cover.
- Do not split room creation and room joining into unrelated marketing cards.
- Use OMR-like underlined fields, compact labels, and room-code affordances.
- Keep the primary actions obvious: create a room or enter a room.
- Remove hero copy that repeats what the layout already shows.

### Lobby

Primary job: confirm who is in the exam room and what rules apply.

- Use examinee list, room code, readiness state, and rule briefing.
- Keep the host or proctor actions visually distinct from examinee actions.
- Show contest timing and freeze rules in concise, checkable form.

### Solving View

Primary job: solve one problem.

- One problem should dominate the page.
- Use exam-paper surface, KICE-style header cues, problem number, subject, and type badge.
- Keep answer submission clear and close to the answer field.
- Do not place full ranking, logs, or analysis beside the problem.
- Problem navigation can show crowd progress with gray fill percentage.
- Current problem and personal solves should use stronger marks.

### Scoreboard

Primary job: compare progress and ranking.

- Use a DOMjudge-like grid.
- Rows are players.
- Columns are problems.
- Cells show accepted time and attempt count.
- Show live or frozen state clearly.
- After freeze, each player can still see their own actual score while public competitor ranks remain frozen.
- Make accepted count, score breakdown, and time bonus legible without decorative clutter.

### Reveal

Primary job: make rank movement legible.

- Show rank change, score movement, and key solves.
- Do not turn reveal into an animation-first page.
- Motion should clarify sequence, not decorate uncertainty.

### Report

Primary job: read like a final document.

- Use document hierarchy, not dashboard cards.
- Prioritize final score, rank, accepted problems, timing, and mistakes.
- Keep error and correction states close to the relevant item.

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
- Can the user verify important states such as score, freeze, rank, submission result, or error?

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

Keep the rationale concise. A design patch should be easier to review than the screen it fixes.

## Source Notes

This document consolidates the original KICE Arena UI direction, the visual balance rules, the low-entropy design agent, and anti-LLM-smell principles into one project-facing design note.
