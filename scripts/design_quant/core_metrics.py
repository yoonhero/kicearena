from __future__ import annotations

import json
import math
import statistics
from pathlib import Path
from typing import Any


ROLE_SIGNAL_WEIGHTS = {
    "primary_action": {"action": 2.0, "primary": 2.0, "verb": 1.5, "exam_room": 1.0},
    "secondary_action": {"action": 1.5, "secondary": 2.0, "verb": 1.0},
    "status": {"state": 2.0, "timer": 1.5, "score": 1.5, "badge": 0.7},
    "input": {"field": 2.0, "answer": 1.5, "identity": 1.5, "omr": 1.0},
    "navigation": {"nav": 2.0, "problem": 0.8, "action": 0.5},
    "feedback": {"feedback": 2.0, "error": 1.5, "success": 1.5, "state": 0.8},
    "data": {"table": 2.0, "score": 1.2, "rank": 1.2, "attempt": 1.0},
    "content": {"problem": 2.0, "copy": 0.8, "instruction": 0.8},
    "redundant_copy": {"copy": 1.0, "redundant": 2.0, "generic": 1.2},
    "decoration": {"ornament": 2.0, "stamp": 1.0, "badge": 0.8, "shadow": 0.6},
}

ENTROPY_WEIGHTS = {
    "redundant_copy_count": 2.0,
    "ambiguous_cta_count": 2.0,
    "decorative_badge_count": 1.5,
    "competing_card_region_count": 1.5,
    "unrelated_accent_color_count": 1.5,
    "generic_ai_phrase_count": 1.0,
    "unnecessary_icon_count": 1.0,
    "overlap_or_alignment_risk_count": 2.0,
    "user_goal_mismatch_count": 2.0,
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def box_of(element: dict[str, Any]) -> tuple[float, float, float, float] | None:
    box = element.get("bbox")
    if not isinstance(box, list) or len(box) != 4:
        return None
    x, y, width, height = box
    return (float(x), float(y), float(width), float(height))


def center(element: dict[str, Any]) -> tuple[float, float] | None:
    box = box_of(element)
    if not box:
        return None
    x, y, width, height = box
    return (x + width / 2, y + height / 2)


def element_area(element: dict[str, Any]) -> float:
    box = box_of(element)
    if not box:
        return 1.0
    return max(1.0, box[2] * box[3])


def viewport_size(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> tuple[float, float]:
    viewport = manifest.get("viewport")
    if isinstance(viewport, dict):
        width = float(viewport.get("width", 0) or 0)
        height = float(viewport.get("height", 0) or 0)
        if width > 0 and height > 0:
            return (width, height)
    if isinstance(viewport, list) and len(viewport) == 2:
        width, height = float(viewport[0]), float(viewport[1])
        if width > 0 and height > 0:
            return (width, height)

    max_x = 0.0
    max_y = 0.0
    for element in elements:
        box = box_of(element)
        if box:
            x, y, width, height = box
            max_x = max(max_x, x + width)
            max_y = max(max_y, y + height)
    return (max(1.0, max_x), max(1.0, max_y))


def image_features(path: Path) -> list[float]:
    try:
        from PIL import Image, ImageFilter, ImageStat
    except Exception:
        return [float(path.stat().st_size % 997) / 997.0]

    with Image.open(path) as image:
        image = image.convert("RGB")
        thumb = image.resize((64, 64))
        gray = thumb.convert("L")
        stat = ImageStat.Stat(thumb)
        edge_stat = ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES))
        width, height = image.size
        return [
            width / max(height, 1),
            *[value / 255.0 for value in stat.mean],
            *[value / 255.0 for value in stat.stddev],
            edge_stat.mean[0] / 255.0,
        ]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    length = min(len(a), len(b))
    if length == 0:
        return 0.0
    dot = sum(a[i] * b[i] for i in range(length))
    norm_a = math.sqrt(sum(a[i] ** 2 for i in range(length)))
    norm_b = math.sqrt(sum(b[i] ** 2 for i in range(length)))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def screen_embedding_diff(screenshots: list[dict[str, Any]], root: Path) -> dict[str, Any]:
    scores: list[float] = []
    details: list[dict[str, Any]] = []
    for screenshot in screenshots:
        path = (root / screenshot["path"]).resolve()
        baseline_value = screenshot.get("baselinePath")
        if not baseline_value:
            continue
        baseline = (root / baseline_value).resolve()
        if not path.exists() or not baseline.exists():
            details.append({"label": screenshot.get("label", path.name), "status": "missing_file"})
            continue
        score = clamp(cosine_similarity(image_features(path), image_features(baseline)))
        scores.append(score)
        details.append({"label": screenshot.get("label", path.name), "similarity": round(score, 4)})
    return {
        "name": "screen_embedding_diff",
        "scoreKey": "consistency_score",
        "score": round(statistics.mean(scores), 4) if scores else 0.5,
        "model": "fallback_image_statistics",
        "details": details,
    }


def minimalism_cluster(manifest: dict[str, Any], root: Path) -> dict[str, Any]:
    examples_path = manifest.get("examplesManifest")
    counts = {"positive_minimal": 0, "negative_cluttered": 0}
    corpus_ready = False
    if examples_path:
        path = Path(examples_path)
        if not path.is_absolute():
            path = root / path
        if path.exists():
            for row in load_json(path).get("examples", []):
                if row.get("label") in counts:
                    counts[row["label"]] += 1
            corpus_ready = counts["positive_minimal"] >= 100 and counts["negative_cluttered"] >= 100

    elements = manifest.get("elements", [])
    element_count = len(elements)
    text_length = sum(len(element.get("text", "")) for element in elements)
    decoration_count = sum(
        1
        for element in elements
        if element.get("role") == "decoration" or "ornament" in element.get("signals", [])
    )
    density_penalty = min(0.45, element_count / 80.0 + text_length / 1800.0 + decoration_count / 20.0)
    corpus_bonus = 0.1 if corpus_ready else 0.0
    score = clamp(0.78 + corpus_bonus - density_penalty)
    return {
        "name": "minimalism_cluster",
        "scoreKey": "minimalism_score",
        "score": round(score, 4),
        "model": "public_example_manifest_plus_density_fallback",
        "corpusReady": corpus_ready,
        "positiveNegativeMargin": round((counts["positive_minimal"] - counts["negative_cluttered"]) / 1000.0, 4),
        "counts": counts,
    }


def role_distribution(signals: list[str]) -> dict[str, float]:
    raw: dict[str, float] = {}
    for role, weights in ROLE_SIGNAL_WEIGHTS.items():
        raw[role] = 0.15 + sum(weights.get(signal, 0.0) for signal in signals)
    total = sum(raw.values())
    return {role: value / total for role, value in raw.items()}


def normalized_entropy(values: list[float]) -> float:
    entropy = -sum(value * math.log2(value) for value in values if value > 0)
    return entropy / math.log2(len(values))


def role_entropy(elements: list[dict[str, Any]]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    scores: list[float] = []
    for element in elements:
        distribution = role_distribution(element.get("signals", []))
        entropy = normalized_entropy(list(distribution.values()))
        ranked = sorted(distribution.values(), reverse=True)
        top_probability = ranked[0]
        top_margin = ranked[0] - ranked[1] if len(ranked) > 1 else ranked[0]
        expected = element.get("role")
        predicted = max(distribution, key=distribution.get)
        correct_bonus = 0.2 if expected == predicted else 0.0
        clarity = correct_bonus + 0.5 * top_probability + 0.3 * top_margin
        if expected and predicted != expected:
            clarity *= 0.65
        scores.append(clamp(clarity))
        rows.append(
            {
                "id": element.get("id"),
                "expected": expected,
                "predicted": predicted,
                "clarity": round(clamp(clarity), 4),
                "entropy": round(entropy, 4),
                "topProbability": round(top_probability, 4),
                "topMargin": round(top_margin, 4),
            }
        )
    return {
        "name": "role_entropy",
        "scoreKey": "role_entropy_score",
        "score": round(statistics.mean(scores), 4) if scores else 0.5,
        "details": rows,
    }


def geometry(elements: list[dict[str, Any]]) -> dict[str, Any]:
    boxes = [element for element in elements if box_of(element)]
    if not boxes:
        return {"name": "layout_geometry", "scoreKey": "geometry_score", "score": 0.5, "details": []}
    penalties = 0.0
    details: list[str] = []
    for element in boxes:
        _, _, width, height = box_of(element) or (0, 0, 0, 0)
        if element.get("role") in {"primary_action", "secondary_action", "input"} and min(width, height) < 40:
            penalties += 0.12
            details.append(f"{element.get('id')} target below 40px")
        if width <= 0 or height <= 0:
            penalties += 0.2
            details.append(f"{element.get('id')} invalid box")
    for index, first in enumerate(boxes):
        ax, ay, aw, ah = box_of(first) or (0, 0, 0, 0)
        for second in boxes[index + 1 :]:
            bx, by, bw, bh = box_of(second) or (0, 0, 0, 0)
            overlap_w = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
            overlap_h = max(0.0, min(ay + ah, by + bh) - max(ay, by))
            overlap_area = overlap_w * overlap_h
            if overlap_area > 0:
                smaller = max(1.0, min(aw * ah, bw * bh))
                ratio = overlap_area / smaller
                if ratio > 0.08:
                    penalties += min(0.2, ratio)
                    details.append(f"{first.get('id')} overlaps {second.get('id')}")
    return {"name": "layout_geometry", "scoreKey": "geometry_score", "score": round(clamp(1.0 - penalties), 4), "details": details}


def copy_density(elements: list[dict[str, Any]]) -> dict[str, Any]:
    text_elements = [element for element in elements if element.get("text")]
    if not text_elements:
        return {"name": "copy_density", "scoreKey": "copy_score", "score": 0.7, "details": []}
    penalties = 0.0
    details: list[str] = []
    for element in text_elements:
        text = element["text"]
        if len(text) > 80:
            penalties += 0.08
            details.append(f"{element.get('id')} long copy")
        if any(phrase in text for phrase in ["AI 기반", "몰입형", "실시간 경험", "플랫폼"]):
            penalties += 0.14
            details.append(f"{element.get('id')} generic product phrase")
    total_chars = sum(len(element["text"]) for element in text_elements)
    penalties += min(0.25, total_chars / 2200.0)
    return {"name": "copy_density", "scoreKey": "copy_score", "score": round(clamp(1.0 - penalties), 4), "details": details}


def has_action_verb(text: str) -> bool:
    return any(verb in text for verb in ["만들기", "입장", "제출", "확인", "시작", "풀기", "이동", "열기"])


def next_action_clarity(elements: list[dict[str, Any]]) -> dict[str, Any]:
    primary = [element for element in elements if element.get("role") == "primary_action"]
    secondary = [element for element in elements if element.get("role") == "secondary_action"]
    details: list[str] = []
    if len(primary) != 1:
        details.append(f"expected one primary action, found {len(primary)}")
    score = 1.0 - min(0.45, abs(len(primary) - 1) * 0.18)
    if primary:
        main = primary[0]
        text = main.get("text", "")
        if not has_action_verb(text) and "verb" not in main.get("signals", []):
            score -= 0.18
            details.append(f"{main.get('id')} lacks action verb")
        if len(text) > 18:
            score -= 0.08
            details.append(f"{main.get('id')} CTA label is long")
        main_center = center(main)
        nearby_secondary = 0
        if main_center:
            for element in secondary:
                other_center = center(element)
                if other_center and math.dist(main_center, other_center) < 220:
                    nearby_secondary += 1
        if nearby_secondary > 2:
            score -= min(0.2, (nearby_secondary - 2) * 0.08)
            details.append(f"{nearby_secondary} secondary actions near primary")
    return {"name": "next_action_clarity", "scoreKey": "next_action_score", "score": round(clamp(score), 4), "details": details}


def derive_entropy_counts(elements: list[dict[str, Any]]) -> dict[str, int]:
    counts = {key: 0 for key in ENTROPY_WEIGHTS}
    for element in elements:
        signals = set(element.get("signals", []))
        text = element.get("text", "")
        if "redundant" in signals:
            counts["redundant_copy_count"] += 1
        if element.get("role") == "primary_action" and not has_action_verb(text):
            counts["ambiguous_cta_count"] += 1
        if "badge" in signals or element.get("role") == "decoration":
            counts["decorative_badge_count"] += 1
        if "card" in signals:
            counts["competing_card_region_count"] += 1
        if "unrelated_accent" in signals:
            counts["unrelated_accent_color_count"] += 1
        if any(phrase in text for phrase in ["AI 기반", "몰입형", "실시간 경험", "플랫폼"]):
            counts["generic_ai_phrase_count"] += 1
        if "unnecessary_icon" in signals:
            counts["unnecessary_icon_count"] += 1
        if "overlap_risk" in signals or "alignment_risk" in signals:
            counts["overlap_or_alignment_risk_count"] += 1
        if "goal_mismatch" in signals:
            counts["user_goal_mismatch_count"] += 1
    return counts


def kice_entropy(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    counts = derive_entropy_counts(elements)
    counts.update({key: int(value) for key, value in manifest.get("entropyCounts", {}).items() if key in counts})
    raw = sum(counts[key] * weight for key, weight in ENTROPY_WEIGHTS.items())
    score = 1.0 / (1.0 + raw / 8.0)
    top_terms = sorted(
        [{"term": key, "count": counts[key], "weighted": counts[key] * ENTROPY_WEIGHTS[key]} for key in counts],
        key=lambda row: row["weighted"],
        reverse=True,
    )[:4]
    return {
        "name": "kice_entropy_rubric",
        "scoreKey": "kice_entropy_score",
        "score": round(score, 4),
        "rawEntropy": round(raw, 4),
        "topTerms": [row for row in top_terms if row["weighted"] > 0],
    }
