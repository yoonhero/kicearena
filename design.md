---
version: alpha
name: KICE Arena
description: Live competitive mock-exam interface with low-entropy, exam-room precise visual language.
colors:
    primary: "#2f6473"
    ink: "#1f2933"
    paper: "#f7f5ef"
    surface: "#ffffff"
    border: "#c8d0c8"
    grading-red: "#b91c1c"
    success-green: "#15803d"
    live-yellow: "#facc15"
    muted: "#4b5563"
typography:
    headline:
        fontFamily: system-ui
        fontSize: 24px
        fontWeight: 700
        lineHeight: 1.2
        letterSpacing: 0
    body:
        fontFamily: system-ui
        fontSize: 16px
        fontWeight: 400
        lineHeight: 1.5
        letterSpacing: 0
    label:
        fontFamily: system-ui
        fontSize: 12px
        fontWeight: 600
        lineHeight: 1.2
        letterSpacing: 0
rounded:
    sm: 4px
    md: 8px
spacing:
    xs: 4px
    sm: 8px
    md: 16px
    lg: 24px
    xl: 32px
components:
    primary-button:
        backgroundColor: "{colors.primary}"
        textColor: "{colors.surface}"
        rounded: "{rounded.sm}"
        height: 48px
    exam-field:
        backgroundColor: "{colors.paper}"
        textColor: "{colors.ink}"
        rounded: 0px
        height: 48px
    scoreboard-cell:
        backgroundColor: "{colors.surface}"
        textColor: "{colors.ink}"
        rounded: 0px
    error-state:
        backgroundColor: "{colors.surface}"
        textColor: "{colors.grading-red}"
    success-state:
        backgroundColor: "{colors.surface}"
        textColor: "{colors.success-green}"
    live-state:
        backgroundColor: "{colors.live-yellow}"
        textColor: "{colors.ink}"
    metadata:
        backgroundColor: "{colors.paper}"
        textColor: "{colors.muted}"
    ruled-separator:
        backgroundColor: "{colors.border}"
        textColor: "{colors.ink}"
---

# KICE Arena Design System

## Overview

KICE Arena should feel like a live competitive mock exam, not a generic game
dashboard or AI-generated landing page. The core visual language is an exam
room: paper surfaces, black ink, ruled lines, OMR-like fields, compact
administration labels, visible state, and DOMjudge-like ranking tables.

Design is the removal of unnecessary interpretation between the user's intent
and the next correct action.

In Korean product copy: 디자인은 사용자의 의도와 다음 행동 사이에 끼어든 불필요한
해석을 제거하는 일이다.

Every screen must answer three questions within roughly 3 seconds:

- Where am I?
- What can I do next?
- What happens if I do it?

Use exam metaphors only when they clarify the workflow. An OMR field is useful
when the user enters identity or selects an answer. A stamp, paper edge, or
ruled line is wrong if it competes with a submit button, timer, rank table, or
report title.

## Colors

The palette is intentionally narrow. The interface should feel like paper,
black ink, and restrained exam administration marks.

- **Primary / UI accent (`#2f6473`):** selected controls, focus affordances,
  compact active states, timing controls, and primary actions.
- **Ink (`#1f2933`):** main text, headings, table content, problem text, and
  stable UI labels.
- **Paper (`#f7f5ef`) and Surface (`#ffffff`):** exam covers, answer sheets,
  problem pages, reports, and quiet backgrounds.
- **Border (`#c8d0c8`):** ruled lines, table grids, underlined fields, and
  quiet separators.
- **Grading red (`#b91c1c`):** grading marks, stamps, warnings, and errors.
- **Success green (`#15803d`):** correctness and successful submissions.
- **Live yellow (`#facc15`):** reveal/live emphasis, used sparingly.

Avoid extra accent families, decorative gradients, unrelated purple/blue
marketing palettes, and color used only to make the page look richer.

## Typography

Typography should be direct, legible, and administrative. Use system UI fonts
unless a screen has a clear reason to use a dedicated exam-document face.

- **Headlines:** concise page identity and route state. Do not use hero-scale
  slogans inside operational screens.
- **Body:** short task-facing sentences close to the control or state they
  explain.
- **Labels:** compact exam-administration labels, table headers, metadata,
  timing, and status. Letter spacing stays `0`.

Primary CTA labels should usually be 2 to 5 Korean words and contain or imply an
action verb.

## Layout

One page has one dominant visual job.

- Entrance screens collect the identity and eligibility needed to enter or
  spectate.
- Lobby screens confirm who is in the exam room and what rules apply.
- Solving screens show one problem as the dominant object.
- Scoreboard screens compare progress and ranking.
- Reveal screens make rank movement legible.
- Report screens read like final documents.

Mobile keeps one primary task per screen and one primary action per decision
point. Avoid dense side-by-side panels. Touch targets should be at least 44px,
and 48px is preferred for touch-first controls.

Desktop can be dense, but it must preserve one dominant visual region. Tables
may be dense when they are structured like contest or exam records.

## Elevation & Depth

Prefer structural separation over shadows. Use ruled lines, underlines, table
grids, paper surfaces, and quiet separators. Do not solve hierarchy with
floating cards, decorative shadows, glow, or gradient panels.

Entrance screens should not split room creation, joining, or identity into
separate card-like regions. Inputs should feel like slips or answer-sheet areas
inside one exam cover.

## Shapes

Use small radii only. Cards, when genuinely needed for repeated items or modal
surfaces, should stay at 8px radius or less. Exam fields may be square or
underlined. Scoreboards and reports should use grid and document structure, not
rounded dashboard cards.

OMR-like bubbles, ruled lines, stamps, and paper covers are allowed only when
they support the current task and do not overlap controls, tables, titles, or
report content.

## Components

### Entrance

The primary job is to show the next contest and collect only the identity needed
to enter it. Treat the viewport as one exam cover. Use OMR-like underlined
fields, compact labels, examinee-ticket affordances, and clear participate or
spectate actions. Remove hero copy that repeats what the layout already shows.

### Lobby

Use examinee lists, room codes, readiness state, and rule briefing. Host or
proctor actions must be visually distinct from examinee actions. Contest timing
and freeze rules should be concise and checkable.

### Solving View

One problem dominates the page on a white exam-paper surface. Use KICE-style
header cues such as school year, period, subject area, type badge, and problem
number. Keep answer submission clear and close to the answer field. Ranking,
logs, and competition analysis belong in the scoreboard route unless they are
essential to solving.

### Scoreboard

Use a DOMjudge-like grid: player rows, problem columns, accepted time, attempt
count, score breakdown, and live/frozen state. During freeze, each player may
see their own actual score while competitor ranks remain frozen.

### Reveal

Show rank change, score movement, and key solves. Motion should clarify
sequence, not decorate uncertainty.

### Report

Use document hierarchy rather than dashboard cards. Prioritize final score,
rank, accepted problems, timing, mistakes, and correction states near the
relevant item.

## Do's and Don'ts

Do:

- Make the next action obvious through layout, scale, labels, state, and
  consequence.
- Reduce content entropy before adding decoration.
- Group dense controls by workflow with quiet separators and stable spacing.
- Write copy from the user's action and consequence.
- Use visible state, concise tables, and checkable scoring/ranking details.
- Keep exam motifs structural, not decorative.

Don't:

- Add generic hero slogans, repeated three-step card sections, decorative
  blinking dots, arbitrary monospace styling, over-polished gradient cards, or
  punchline-style marketing copy.
- Use phrases such as `AI 기반`, `실시간 경험`, or `몰입형 경쟁 플랫폼` in user
  flows.
- Humanize the system when the product needs a precise instrument.
- Add badges, icons, tooltips, shadows, gradients, paragraphs, or animations
  unless removing them would reduce task success.
- Make a page look richer while making the task less direct.

Entropy review formula:

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
