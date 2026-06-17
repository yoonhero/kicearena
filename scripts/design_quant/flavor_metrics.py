from __future__ import annotations

import statistics
from typing import Any

from core_metrics import clamp


ACCENT = "#2f6473"
AI_WEB_PHRASES = [
    "AI 기반",
    "실시간 경험",
    "몰입형 경쟁 플랫폼",
    "X is the Y of Z",
    "Not just",
]
AI_WEB_SIGNALS = {"generic_hero", "three_step", "blinking_dot", "gradient", "glow", "ai_smell"}
ALLOWED_COLOR_FAMILIES = {
    "accent",
    "ink",
    "paper",
    "grading_red",
    "success_green",
    "live_yellow",
    "neutral",
}
EXAM_SURFACE_SIGNALS = {"paper", "exam_paper", "exam_cover", "ruled", "ink", "exam_surface"}
OMR_SIGNALS = {"omr", "answer_sheet", "underlined", "bubble", "identity", "field", "ticket"}
MOTIF_SIGNALS = EXAM_SURFACE_SIGNALS | OMR_SIGNALS | {"stamp", "proctor", "exam_room"}

ROUTE_EXPECTATIONS = {
    "entrance": {
        "routes": ("home", "entrance", "event"),
        "roles": {"primary_action", "input", "status", "content"},
        "signals": {"exam_room", "identity", "omr", "ticket", "referral", "spectate"},
    },
    "lobby": {
        "routes": ("lobby", "room"),
        "roles": {"data", "status", "primary_action", "secondary_action"},
        "signals": {"room_code", "examinee", "rule", "timer", "proctor"},
    },
    "solving": {
        "routes": ("solve", "problem", "question"),
        "roles": {"content", "input", "primary_action", "navigation", "status"},
        "signals": {"problem", "answer", "subject", "type_badge", "timer"},
    },
    "scoreboard": {
        "routes": ("score", "rank", "board"),
        "roles": {"data", "status", "navigation"},
        "signals": {"table", "rank", "score", "attempt", "accepted", "freeze"},
    },
    "reveal": {
        "routes": ("reveal",),
        "roles": {"data", "status", "content"},
        "signals": {"rank", "score", "movement", "accepted"},
    },
    "report": {
        "routes": ("report", "result"),
        "roles": {"data", "content", "status"},
        "signals": {"document", "rank", "score", "mistake", "correction"},
    },
}


def kice_visual_flavor(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> dict[str, Any]:
    submetrics = {
        "examSurface": exam_surface_score(manifest, elements),
        "omrAffordance": omr_affordance_score(manifest, elements),
        "structuralMotif": structural_motif_score(elements),
        "paperInkRestraint": paper_ink_restraint_score(manifest, elements),
        "contestTableFidelity": contest_table_fidelity_score(manifest, elements),
        "antiAiWeb": anti_ai_web_score(manifest, elements),
        "pageJobAlignment": page_job_alignment_score(manifest, elements),
    }
    weights = {
        "examSurface": 0.16,
        "omrAffordance": 0.12,
        "structuralMotif": 0.16,
        "paperInkRestraint": 0.16,
        "contestTableFidelity": 0.12,
        "antiAiWeb": 0.16,
        "pageJobAlignment": 0.12,
    }
    score = sum(submetrics[key] * weight for key, weight in weights.items())
    return {
        "name": "kice_visual_flavor",
        "scoreKey": "kice_flavor_score",
        "score": round(clamp(score), 4),
        "submetrics": {key: round(value, 4) for key, value in submetrics.items()},
        "details": flavor_details(manifest, elements, submetrics),
    }


def exam_surface_score(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> float:
    signals = manifest_signals(manifest) | all_signals(elements)
    route = route_family(manifest)
    signal_score = signal_presence_score(signals, EXAM_SURFACE_SIGNALS, expected=3)
    background = str(manifest.get("backgroundColor", "")).lower()
    paper_bonus = 0.15 if background in {"#ffffff", "#fff", "#f7f5ef", "#faf7ef", "#f8f5ec"} else 0.0
    if signal_score == 0 and paper_bonus == 0:
        return 0.35 if route in {"entrance", "solving", "report"} else 0.55
    return clamp(signal_score + paper_bonus)


def omr_affordance_score(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> float:
    route = route_family(manifest)
    candidates = [element for element in elements if element.get("role") in {"input", "primary_action", "secondary_action"}]
    if not candidates:
        return 0.62 if route not in {"entrance", "solving"} else 0.45
    scores = [signal_presence_score(set(element.get("signals", [])), OMR_SIGNALS, expected=2) for element in candidates]
    base = statistics.mean(scores)
    if route in {"entrance", "solving"}:
        return clamp(base)
    return clamp(0.65 + base * 0.35)


def structural_motif_score(elements: list[dict[str, Any]]) -> float:
    motif_elements = [element for element in elements if set(element.get("signals", [])) & MOTIF_SIGNALS]
    if not motif_elements:
        return 0.55
    support_scores = []
    for element in motif_elements:
        signals = set(element.get("signals", []))
        role = element.get("role")
        supports_task = role not in {"decoration", "redundant_copy"} and "ornament" not in signals
        overlap_risk = bool(signals & {"overlap_risk", "alignment_risk"})
        support_scores.append(1.0 if supports_task and not overlap_risk else 0.35)
    return clamp(statistics.mean(support_scores))


def paper_ink_restraint_score(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> float:
    colors = [color.lower() for color in manifest.get("palette", []) if isinstance(color, str)]
    for element in elements:
        for key in ("color", "backgroundColor", "borderColor", "accentColor"):
            value = element.get(key)
            if isinstance(value, str):
                colors.append(value.lower())
    families = {color_family(color) for color in colors}
    unrelated = sum(1 for element in elements if "unrelated_accent" in element.get("signals", []))
    accent_hits = sum(1 for color in colors if color_distance_score(color, ACCENT) >= 0.88)
    family_score = clamp(1.0 - max(0, len(families - ALLOWED_COLOR_FAMILIES) + len(families) - 6) * 0.12)
    accent_score = 0.75 if not colors else clamp(0.65 + min(accent_hits, 3) * 0.1)
    unrelated_penalty = min(0.35, unrelated * 0.12)
    return clamp(0.55 * family_score + 0.45 * accent_score - unrelated_penalty)


def contest_table_fidelity_score(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> float:
    route = route_family(manifest)
    data_elements = [element for element in elements if element.get("role") == "data" or "table" in element.get("signals", [])]
    signals = all_signals(data_elements)
    if route != "scoreboard":
        return 0.75 if not data_elements else signal_presence_score(signals, {"table", "rank", "score", "attempt", "accepted"}, 3)
    if not data_elements:
        return 0.35
    table_score = signal_presence_score(signals, {"table", "rank", "score", "attempt", "accepted", "freeze"}, 4)
    density_bonus = 0.15 if len(data_elements) >= 3 else 0.0
    return clamp(table_score + density_bonus)


def anti_ai_web_score(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> float:
    text = " ".join(str(element.get("text", "")) for element in elements)
    phrase_hits = sum(1 for phrase in AI_WEB_PHRASES if phrase in text)
    signal_hits = sum(len(set(element.get("signals", [])) & AI_WEB_SIGNALS) for element in elements)
    style_hits = sum(1 for style in manifest.get("emphasisStyles", []) if style in AI_WEB_SIGNALS)
    penalties = phrase_hits * 0.16 + signal_hits * 0.12 + style_hits * 0.08
    return clamp(1.0 - penalties)


def page_job_alignment_score(manifest: dict[str, Any], elements: list[dict[str, Any]]) -> float:
    family = route_family(manifest)
    expected = ROUTE_EXPECTATIONS[family]
    roles = {element.get("role") for element in elements}
    signals = all_signals(elements)
    dominant_roles = set(manifest.get("dominantRoles") or [])
    role_score = overlap_score(roles, expected["roles"])
    signal_score = overlap_score(signals, expected["signals"])
    dominant_score = 0.75 if not dominant_roles else overlap_score(dominant_roles, expected["roles"])
    return clamp(0.4 * role_score + 0.35 * signal_score + 0.25 * dominant_score)


def route_family(manifest: dict[str, Any]) -> str:
    route = str(manifest.get("route", "entrance")).lower()
    for family, expectation in ROUTE_EXPECTATIONS.items():
        if any(fragment in route for fragment in expectation["routes"]):
            return family
    return "entrance"


def manifest_signals(manifest: dict[str, Any]) -> set[str]:
    values = manifest.get("flavorSignals", [])
    return {value for value in values if isinstance(value, str)}


def all_signals(elements: list[dict[str, Any]]) -> set[str]:
    return {signal for element in elements for signal in element.get("signals", []) if isinstance(signal, str)}


def signal_presence_score(signals: set[str], expected_signals: set[str], expected: int) -> float:
    hits = len(signals & expected_signals)
    return clamp(hits / max(expected, 1))


def overlap_score(actual: set[Any], expected: set[str]) -> float:
    return clamp(len(actual & expected) / max(min(len(expected), 3), 1))


def flavor_details(
    manifest: dict[str, Any], elements: list[dict[str, Any]], submetrics: dict[str, float]
) -> list[str]:
    details = [f"{key} below 0.6" for key, value in submetrics.items() if value < 0.6]
    if route_family(manifest) == "scoreboard" and submetrics["contestTableFidelity"] < 0.6:
        details.append("scoreboard lacks DOMjudge-like table signals")
    if any("gradient" in element.get("signals", []) for element in elements):
        details.append("generic gradient signal present")
    return details


def color_family(color: str) -> str:
    if color_distance_score(color, ACCENT) >= 0.88:
        return "accent"
    if color in {"#111111", "#1f2933", "#000000", "#172026", "#222222"}:
        return "ink"
    if color in {"#ffffff", "#fff", "#f7f5ef", "#faf7ef", "#f8f5ec"}:
        return "paper"
    if color.startswith("#b91") or color.startswith("#dc2") or color.startswith("#ef4"):
        return "grading_red"
    if color.startswith("#16a") or color.startswith("#22c") or color.startswith("#158"):
        return "success_green"
    if color.startswith("#f59") or color.startswith("#eab") or color.startswith("#facc"):
        return "live_yellow"
    if color.startswith("#6b") or color.startswith("#9ca") or color.startswith("#d1d"):
        return "neutral"
    return "other"


def color_distance_score(first: str, second: str) -> float:
    first_rgb = parse_hex(first)
    second_rgb = parse_hex(second)
    if not first_rgb or not second_rgb:
        return 0.0
    distance = sum((a - b) ** 2 for a, b in zip(first_rgb, second_rgb)) ** 0.5
    return clamp(1.0 - distance / (3**0.5))


def parse_hex(color: str) -> tuple[float, float, float] | None:
    value = color.strip().lower()
    if value.startswith("#"):
        value = value[1:]
    if len(value) == 3:
        value = "".join(part * 2 for part in value)
    if len(value) != 6:
        return None
    try:
        return (int(value[0:2], 16) / 255.0, int(value[2:4], 16) / 255.0, int(value[4:6], 16) / 255.0)
    except ValueError:
        return None
