from __future__ import annotations

import colorsys
import math
import statistics
from typing import Any

from core_metrics import box_of, center, clamp, element_area, viewport_size


ROLE_PROMINENCE = {
    "primary_action": 1.7,
    "content": 1.45,
    "data": 1.35,
    "input": 1.25,
    "status": 1.15,
    "navigation": 1.0,
    "feedback": 1.0,
    "secondary_action": 0.9,
    "redundant_copy": 0.55,
    "decoration": 0.45,
}

ACCENT = "#2f6473"


def prominence(element: dict[str, Any]) -> float:
    explicit = element.get("prominence")
    if isinstance(explicit, int | float):
        return max(0.1, float(explicit))
    area_weight = math.sqrt(element_area(element)) / 120.0
    role_weight = ROLE_PROMINENCE.get(element.get("role"), 0.8)
    signals = set(element.get("signals", []))
    signal_bonus = 0.25 if signals & {"primary", "selected", "active"} else 0.0
    signal_penalty = 0.2 if signals & {"ornament", "redundant"} else 0.0
    return max(0.1, role_weight + area_weight + signal_bonus - signal_penalty)


def visual_balance(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    boxes = [element for element in elements if box_of(element)]
    if not boxes:
        return {"name": "visual_balance", "scoreKey": "visual_balance_score", "score": 0.5, "details": []}
    width, height = viewport_size(manifest, boxes)
    total_weight = 0.0
    weighted_x = 0.0
    weighted_y = 0.0
    quadrants = [0.0, 0.0, 0.0, 0.0]
    for element in boxes:
        cx, cy = center(element) or (0.0, 0.0)
        weight = prominence(element) * element_area(element)
        total_weight += weight
        weighted_x += cx * weight
        weighted_y += cy * weight
        index = (1 if cx > width / 2 else 0) + (2 if cy > height / 2 else 0)
        quadrants[index] += weight
    mass_x = weighted_x / total_weight
    mass_y = weighted_y / total_weight
    dx = abs(mass_x - width / 2) / max(width / 2, 1.0)
    horizontal_score = clamp(1.0 - dx * 1.35)
    vertical_ratio = mass_y / height
    vertical_score = clamp(1.0 - max(0.0, abs(vertical_ratio - 0.42) - 0.22) * 2.2)
    balance_entropy = normalized_entropy([value / total_weight for value in quadrants if value > 0], 4)
    axis_score = single_axis_score(boxes, width)
    distribution_score = max(balance_entropy, axis_score)
    score = 0.45 * horizontal_score + 0.3 * vertical_score + 0.25 * distribution_score
    return {
        "name": "visual_balance",
        "scoreKey": "visual_balance_score",
        "score": round(clamp(score), 4),
        "centerOfMass": [round(mass_x / width, 4), round(mass_y / height, 4)],
        "quadrantEntropy": round(balance_entropy, 4),
        "axisScore": round(axis_score, 4),
    }


def hierarchy_strength(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    if not elements:
        return {"name": "hierarchy_strength", "scoreKey": "hierarchy_score", "score": 0.5, "details": []}
    rows = sorted(
        [{"id": element.get("id"), "role": element.get("role"), "prominence": prominence(element)} for element in elements],
        key=lambda row: row["prominence"],
        reverse=True,
    )
    top = rows[0]["prominence"]
    second = rows[1]["prominence"] if len(rows) > 1 else top * 0.25
    margin = clamp((top - second) / max(top, 1.0))
    dominant_role = rows[0]["role"]
    expected_roles = set(manifest.get("dominantRoles") or ["primary_action", "content", "data"])
    role_match = 1.0 if dominant_role in expected_roles else 0.55
    styles = manifest.get("emphasisStyles", [])
    style_count = len(styles) if isinstance(styles, list) else 0
    style_score = clamp(1.0 - max(0, style_count - 3) * 0.18)
    score = 0.45 * (0.55 + 0.45 * margin) + 0.35 * role_match + 0.2 * style_score
    return {
        "name": "hierarchy_strength",
        "scoreKey": "hierarchy_score",
        "score": round(clamp(score), 4),
        "dominantElement": rows[0],
        "topMargin": round(margin, 4),
        "emphasisStyleCount": style_count,
    }


def rhythm_grid(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    boxes = [box_of(element) for element in elements if box_of(element)]
    boxes = [box for box in boxes if box]
    if len(boxes) < 3:
        return {"name": "rhythm_grid", "scoreKey": "rhythm_score", "score": 0.65, "details": ["too few boxes"]}
    coordinates = []
    for x, y, width, height in boxes:
        coordinates.extend([x, x + width / 2, x + width])
    alignment_error = nearest_cluster_error(coordinates)
    alignment_score = clamp(1.0 - alignment_error / 16.0)
    vertical_gaps = positive_gaps(sorted(y for _, y, _, _ in boxes))
    gap_score = 0.75
    if len(vertical_gaps) >= 2:
        mean_gap = statistics.mean(vertical_gaps)
        if mean_gap > 0:
            gap_score = clamp(1.0 - statistics.pstdev(vertical_gaps) / (mean_gap * 1.8))
    score = 0.65 * alignment_score + 0.35 * gap_score
    return {
        "name": "rhythm_grid",
        "scoreKey": "rhythm_score",
        "score": round(clamp(score), 4),
        "alignmentErrorPx": round(alignment_error, 2),
        "gapScore": round(gap_score, 4),
    }


def color_harmony(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    colors = extract_colors(manifest, elements)
    if not colors:
        return {"name": "color_harmony", "scoreKey": "color_harmony_score", "score": 0.55, "details": ["no colors"]}
    unique = sorted(set(colors))
    complexity_score = clamp(1.0 - max(0, len(unique) - 6) * 0.08)
    accent_items = [
        color
        for element in elements
        for color in element_colors(element)
        if set(element.get("signals", [])) & {"primary", "selected", "active", "accent"}
    ]
    accent_score = 0.75
    if accent_items:
        accent_score = sum(color_distance_score(color, ACCENT) for color in accent_items) / len(accent_items)
    hue_values = [rgb_to_hsv(parse_hex(color))[0] for color in unique if parse_hex(color)]
    hue_score = hue_coherence(hue_values)
    score = 0.4 * complexity_score + 0.35 * accent_score + 0.25 * hue_score
    return {
        "name": "color_harmony",
        "scoreKey": "color_harmony_score",
        "score": round(clamp(score), 4),
        "paletteSize": len(unique),
        "accentScore": round(accent_score, 4),
        "hueCoherence": round(hue_score, 4),
    }


def contrast_legibility(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    pairs = []
    for element in elements:
        if not element.get("text"):
            continue
        foreground = element.get("color")
        background = element.get("backgroundColor") or manifest.get("backgroundColor")
        if isinstance(foreground, str) and isinstance(background, str):
            pairs.append((element, foreground, background))
    if not pairs:
        return {
            "name": "contrast_legibility",
            "scoreKey": "contrast_score",
            "score": 0.6,
            "details": ["no foreground/background pairs"],
        }

    scores = []
    details = []
    for element, foreground, background in pairs:
        ratio = contrast_ratio(foreground, background)
        font_size = float(element.get("fontSize", 14) or 14)
        required = 3.0 if font_size >= 18 or element.get("role") == "primary_action" else 4.5
        pair_score = clamp(ratio / required)
        scores.append(pair_score)
        if ratio < required:
            details.append(f"{element.get('id')} contrast {ratio:.2f} below {required:.1f}")
    return {
        "name": "contrast_legibility",
        "scoreKey": "contrast_score",
        "score": round(statistics.mean(scores), 4),
        "details": details,
    }


def typographic_scale(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    sizes = []
    for element in elements:
        size = element.get("fontSize")
        if isinstance(size, int | float):
            sizes.append(float(size))
    manifest_sizes = manifest.get("typographyScale", [])
    if isinstance(manifest_sizes, list):
        sizes.extend(float(size) for size in manifest_sizes if isinstance(size, int | float))
    if not sizes:
        return {"name": "typographic_scale", "scoreKey": "typography_score", "score": 0.55, "details": ["no font sizes"]}

    unique = sorted({round(size) for size in sizes})
    complexity_score = clamp(1.0 - max(0, len(unique) - 5) * 0.12)
    min_size = min(sizes)
    max_size = max(sizes)
    minimum_score = clamp((min_size - 10) / 4.0)
    ratio = max_size / max(min_size, 1.0)
    ratio_score = clamp(1.0 - abs(ratio - 1.65) / 1.65)
    score = 0.35 * complexity_score + 0.3 * minimum_score + 0.35 * ratio_score
    return {
        "name": "typographic_scale",
        "scoreKey": "typography_score",
        "score": round(clamp(score), 4),
        "scale": unique,
        "ratio": round(ratio, 4),
    }


def normalized_entropy(values: list[float], bucket_count: int) -> float:
    if not values:
        return 0.0
    entropy = -sum(value * math.log2(value) for value in values if value > 0)
    return entropy / math.log2(bucket_count)


def single_axis_score(elements: list[dict[str, Any]], width: float) -> float:
    centers = [center(element)[0] for element in elements if center(element)]
    if len(centers) < 2:
        return 0.7
    mean_center = statistics.mean(centers)
    center_deviation = statistics.pstdev(centers) / max(width, 1.0)
    page_deviation = abs(mean_center - width / 2) / max(width / 2, 1.0)
    return clamp(1.0 - center_deviation * 4.0 - page_deviation * 1.2)


def nearest_cluster_error(values: list[float]) -> float:
    clusters: list[float] = []
    errors: list[float] = []
    for value in sorted(values):
        nearby = [cluster for cluster in clusters if abs(cluster - value) <= 8]
        if nearby:
            cluster = nearby[0]
            errors.append(abs(cluster - value))
            clusters[clusters.index(cluster)] = (cluster + value) / 2
        else:
            clusters.append(value)
            errors.append(0.0)
    return statistics.mean(errors) if errors else 0.0


def positive_gaps(values: list[float]) -> list[float]:
    gaps = []
    for first, second in zip(values, values[1:]):
        gap = second - first
        if gap > 4:
            gaps.append(gap)
    return gaps


def extract_colors(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> list[str]:
    colors: list[str] = []
    palette = manifest.get("palette", [])
    if isinstance(palette, list):
        colors.extend(color for color in palette if isinstance(color, str) and parse_hex(color))
    for element in elements:
        colors.extend(element_colors(element))
    return colors


def element_colors(element: dict[str, Any]) -> list[str]:
    colors = []
    for key in ("color", "backgroundColor", "borderColor", "accentColor"):
        value = element.get(key)
        if isinstance(value, str) and parse_hex(value):
            colors.append(value)
    return colors


def parse_hex(color: str) -> tuple[float, float, float] | None:
    value = color.strip().lower()
    if value.startswith("#"):
        value = value[1:]
    if len(value) == 3:
        value = "".join(part * 2 for part in value)
    if len(value) != 6:
        return None
    try:
        red = int(value[0:2], 16) / 255.0
        green = int(value[2:4], 16) / 255.0
        blue = int(value[4:6], 16) / 255.0
    except ValueError:
        return None
    return (red, green, blue)


def rgb_to_hsv(rgb: tuple[float, float, float] | None) -> tuple[float, float, float]:
    if not rgb:
        return (0.0, 0.0, 0.0)
    return colorsys.rgb_to_hsv(*rgb)


def relative_luminance(color: str) -> float:
    rgb = parse_hex(color)
    if not rgb:
        return 0.0

    def channel(value: float) -> float:
        if value <= 0.03928:
            return value / 12.92
        return ((value + 0.055) / 1.055) ** 2.4

    red, green, blue = [channel(value) for value in rgb]
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast_ratio(first: str, second: str) -> float:
    first_luminance = relative_luminance(first)
    second_luminance = relative_luminance(second)
    lighter = max(first_luminance, second_luminance)
    darker = min(first_luminance, second_luminance)
    return (lighter + 0.05) / (darker + 0.05)


def color_distance_score(first: str, second: str) -> float:
    first_rgb = parse_hex(first)
    second_rgb = parse_hex(second)
    if not first_rgb or not second_rgb:
        return 0.5
    distance = math.sqrt(sum((a - b) ** 2 for a, b in zip(first_rgb, second_rgb)))
    return clamp(1.0 - distance / math.sqrt(3))


def hue_coherence(hues: list[float]) -> float:
    if len(hues) <= 1:
        return 0.8
    radians = [hue * math.tau for hue in hues]
    x = sum(math.cos(value) for value in radians) / len(radians)
    y = sum(math.sin(value) for value in radians) / len(radians)
    concentration = math.hypot(x, y)
    diversity = 1.0 - concentration
    return clamp(0.35 + 0.45 * concentration + 0.2 * diversity)
