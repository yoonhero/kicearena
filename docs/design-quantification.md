# Quantitative Design Review

KICE Arena design review can use small quantitative evaluators before a human
UI decision. The numbers do not replace `DESIGN_NOTES.md`; they make the design
argument checkable.

## Subsubagents

The `ui_ux_designer` agent treats these as local subsubagents. They are Python
modules, not nested Codex agents, because this repo's Codex config limits agent
depth to 1.

| Subsubagent             | Question                                                                   | Primary score          |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------- |
| `screen_embedding_diff` | Does the new screen preserve the intended visual language?                 | `consistency_score`    |
| `minimalism_cluster`    | Is the screen closer to simple, role-clear interfaces than cluttered ones? | `minimalism_score`     |
| `role_entropy`          | Does each element have one clear job?                                      | `role_entropy_score`   |
| `layout_geometry`       | Do elements align, avoid overlap, and keep a clear hierarchy?              | `geometry_score`       |
| `copy_density`          | Is text doing visible work instead of explaining the layout twice?         | `copy_score`           |
| `next_action_clarity`   | Is the main action uniquely detectable and verb-led?                       | `next_action_score`    |
| `kice_entropy_rubric`   | Does the existing KICE entropy formula require revision?                   | `kice_entropy_score`   |
| `visual_balance`        | Is visual mass distributed with intentional balance?                       | `visual_balance_score` |
| `hierarchy_strength`    | Does the dominant element match the page's job?                            | `hierarchy_score`      |
| `rhythm_grid`           | Do repeated boxes align and breathe with stable rhythm?                    | `rhythm_score`         |
| `color_harmony`         | Is the palette restrained and aligned to the KICE accent?                  | `color_harmony_score`  |
| `contrast_legibility`   | Is text contrast readable enough for its scale?                            | `contrast_score`       |
| `typographic_scale`     | Does type use a limited, meaningful scale?                                 | `typography_score`     |

The combined decision score is a weighted average:

```text
0.08 * consistency_score
+ 0.12 * minimalism_score
+ 0.12 * role_entropy_score
+ 0.09 * geometry_score
+ 0.07 * copy_score
+ 0.11 * next_action_score
+ 0.07 * kice_entropy_score
+ 0.08 * visual_balance_score
+ 0.07 * hierarchy_score
+ 0.05 * rhythm_score
+ 0.05 * color_harmony_score
+ 0.06 * contrast_score
+ 0.03 * typography_score
```

Scores are in `[0, 1]`. A route should usually be revised below `0.72`, and it
should be treated as a failed design review below `0.60`.

The report also returns `aestheticScore`, weighted toward aesthetic qualities:

```text
0.15 * minimalism_score
+ 0.16 * visual_balance_score
+ 0.16 * hierarchy_score
+ 0.12 * rhythm_score
+ 0.12 * color_harmony_score
+ 0.12 * contrast_score
+ 0.08 * typography_score
+ 0.05 * copy_score
+ 0.04 * geometry_score
```

`aestheticDecision` is `aesthetically_good` above `0.74`,
`aesthetic_revision` below that, and `aesthetic_fail` below `0.58`.

## Public Models And Modules

The evaluator uses public, optional models when installed:

- `sentence-transformers` with `clip-ViT-B-32` for screenshot embeddings.
- `transformers` with `openai/clip-vit-base-patch32` can be added later behind
  the same embedding interface.
- `Pillow` and `numpy` for deterministic fallback image features.

If those modules are unavailable, the scripts still run with standard-library
logic and simple image statistics. That fallback is weaker, so the output marks
`model: fallback`.

## Example Corpus

Use at least 100 positive and 100 negative public image references before
trusting `minimalism_cluster`.

```bash
conda run -n mlenv python scripts/design_quant/collect_examples.py \
  --output .design-examples/ui-minimalism.json \
  --per-label 120
```

The collector stores URLs and source metadata, not copied images. If a later
review needs offline reproducibility, download/cache only images whose licenses
and source terms are acceptable for the project.

The minimalism report exposes corpus readiness and a positive/negative margin.
For a stricter run, cache the manifest images and replace the fallback density
features with CLIP embeddings from the same public URLs.

## Evaluation Manifest

Create a manifest with screenshots and optional element boxes:

```json
{
    "route": "home",
    "viewport": { "width": 390, "height": 844 },
    "backgroundColor": "#f7f5ef",
    "palette": ["#f7f5ef", "#1f2933", "#2f6473", "#b91c1c"],
    "typographyScale": [14, 16, 20],
    "dominantRoles": ["primary_action", "content"],
    "emphasisStyles": ["accent", "bold", "stamp"],
    "screenshots": [
        {
            "label": "desktop",
            "path": ".feedback/home-desktop.png",
            "baselinePath": ".feedback/home-desktop-before.png"
        }
    ],
    "elements": [
        {
            "id": "create-room",
            "role": "primary_action",
            "text": "시험실 만들기",
            "bbox": [120, 680, 184, 48],
            "signals": ["action", "exam_room", "primary"],
            "color": "#ffffff",
            "backgroundColor": "#2f6473",
            "accentColor": "#2f6473",
            "fontSize": 16,
            "prominence": 2.4
        }
    ],
    "entropyCounts": {
        "redundant_copy_count": 0,
        "ambiguous_cta_count": 0,
        "decorative_badge_count": 0,
        "competing_card_region_count": 0,
        "unrelated_accent_color_count": 0,
        "generic_ai_phrase_count": 0,
        "unnecessary_icon_count": 0,
        "overlap_or_alignment_risk_count": 0,
        "user_goal_mismatch_count": 0
    },
    "examplesManifest": ".design-examples/ui-minimalism.json"
}
```

Run:

```bash
conda run -n mlenv python scripts/design_quant/evaluate.py \
  --manifest .feedback/design-eval-home.json \
  --output .feedback/design-eval-home.report.json
```

## Decision Rules

- A high embedding diff with a high minimalism score means the screen changed
  style but may be a valid improvement; inspect before rejecting.
- A low role entropy score on primary actions is a hard blocker. The next action
  is unclear.
- A low minimalism score with high copy density usually means the UI is using
  explanation to compensate for weak hierarchy.
- A low `next_action_score` means the primary CTA is ambiguous, missing an
  action verb, or competing with too many nearby secondary actions.
- A high `kice_entropy_rubric.rawEntropy` should be read against
  `DESIGN_NOTES.md`; the top terms identify the first changes to make.
- A low `visual_balance_score` means the visual center of mass is drifting from
  the page axis, or the screen lacks either quadrant balance or a deliberate
  single-column flow.
- A low `hierarchy_score` means the most prominent element is not the page's
  real job, or too many emphasis styles are competing.
- A low `rhythm_score` means alignment clusters or vertical spacing are noisy.
- A low `color_harmony_score` means the palette is too broad or emphasized
  elements have drifted away from `--ui-accent: #2f6473`.
- A low `contrast_score` blocks "pretty but unreadable" choices.
- A low `typography_score` means type sizes are too small, too flat, or too
  numerous to create deliberate hierarchy.
- Any overlap or touch target below 40px near a primary action should override
  the combined score and require revision.

## Future Strict Mode

The current script is intentionally dependency-light. A strict evaluator can
use the same manifest and add:

- Route-specific approved-screen centroids for entrance, lobby, solving,
  scoreboard, reveal, and report.
- Negative centroids for generic AI hero pages, decorative cards, and cluttered
  dashboards.
- Mobile/desktop drift: distance between screenshots for the same route.
- Accent purity from rendered CSS, not only manifest colors.
- Contest legibility: visibility of score, freeze state, rank, accepted count,
  attempt count, submission result, and DOMjudge-grid structure.
