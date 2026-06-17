from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from aesthetic_metrics import (
    color_harmony,
    contrast_legibility,
    hierarchy_strength,
    rhythm_grid,
    typographic_scale,
    visual_balance,
)
from core_metrics import (
    copy_density,
    geometry,
    kice_entropy,
    load_json,
    minimalism_cluster,
    next_action_clarity,
    role_entropy,
    screen_embedding_diff,
)
from flavor_metrics import kice_visual_flavor


DECISION_WEIGHTS = {
    "consistency_score": 0.08,
    "minimalism_score": 0.11,
    "role_entropy_score": 0.11,
    "geometry_score": 0.09,
    "copy_score": 0.07,
    "next_action_score": 0.11,
    "kice_entropy_score": 0.06,
    "visual_balance_score": 0.08,
    "hierarchy_score": 0.07,
    "rhythm_score": 0.05,
    "color_harmony_score": 0.05,
    "contrast_score": 0.06,
    "typography_score": 0.03,
    "kice_flavor_score": 0.03,
}

AESTHETIC_WEIGHTS = {
    "minimalism_score": 0.13,
    "visual_balance_score": 0.15,
    "hierarchy_score": 0.16,
    "rhythm_score": 0.12,
    "color_harmony_score": 0.12,
    "contrast_score": 0.12,
    "typography_score": 0.08,
    "copy_score": 0.05,
    "geometry_score": 0.04,
    "kice_flavor_score": 0.03,
}


def weighted_score(scores: dict[str, float], weights: dict[str, float]) -> float:
    return sum(scores.get(key, 0.5) * weight for key, weight in weights.items())


def evaluate(manifest: dict[str, Any], root: Path) -> dict[str, Any]:
    elements = manifest.get("elements", [])
    subreports = [
        screen_embedding_diff(manifest.get("screenshots", []), root),
        minimalism_cluster(manifest, root),
        role_entropy(elements),
        geometry(elements),
        copy_density(elements),
        next_action_clarity(elements),
        kice_entropy(manifest, elements),
        visual_balance(manifest, elements),
        hierarchy_strength(manifest, elements),
        rhythm_grid(manifest, elements),
        color_harmony(manifest, elements),
        contrast_legibility(manifest, elements),
        typographic_scale(manifest, elements),
        kice_visual_flavor(manifest, elements),
    ]
    scores = {report["scoreKey"]: report["score"] for report in subreports}
    combined = weighted_score(scores, DECISION_WEIGHTS)
    aesthetic = weighted_score(scores, AESTHETIC_WEIGHTS)
    hard_fail = has_hard_fail(subreports, aesthetic)
    decision = design_decision(combined, aesthetic, hard_fail)
    return {
        "schema": "kice.designQuantReport.v2",
        "route": manifest.get("route", "unknown"),
        "combinedScore": round(combined, 4),
        "aestheticScore": round(aesthetic, 4),
        "decision": decision,
        "aestheticDecision": aesthetic_decision(aesthetic),
        "scores": scores,
        "subsubagents": subreports,
    }


def has_hard_fail(subreports: list[dict[str, Any]], aesthetic: float) -> bool:
    if aesthetic < 0.58:
        return True
    return any(
        "target below 40px" in detail or "overlaps" in detail
        for report in subreports
        for detail in report.get("details", [])
        if isinstance(detail, str)
    )


def design_decision(combined: float, aesthetic: float, hard_fail: bool) -> str:
    if hard_fail or combined < 0.6:
        return "fail"
    if combined < 0.72 or aesthetic < 0.68:
        return "revise"
    return "accept"


def aesthetic_decision(aesthetic: float) -> str:
    if aesthetic < 0.58:
        return "aesthetic_fail"
    if aesthetic < 0.74:
        return "aesthetic_revision"
    return "aesthetically_good"


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate KICE Arena screen design quantitatively.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()

    manifest_path = Path(args.manifest).resolve()
    report = evaluate(load_json(manifest_path), manifest_path.parent)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
