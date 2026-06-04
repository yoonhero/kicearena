#!/usr/bin/env python3
"""
Create one-problem-per-image server exam assets from a KICE-style math PDF.

Run with:
  conda run -n mlenv python scripts/prepare_kice_math_problems.py tmp/kice-2026-june/math.pdf server/exams
  conda run -n mlenv python scripts/prepare_kice_math_problems.py tmp/kice-2027-june/math.pdf server/exams 2027-june

The script uses PDF text-layer extraction as the primary OCR-like text source.
KICE math PDFs embed formulas with private-use glyphs, so the image crop remains
the authoritative rendering while `text` gives the web app searchable metadata.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import fitz


COMMON_ANSWERS_2026_JUNE = {
    1: "2",
    2: "1",
    3: "3",
    4: "3",
    5: "2",
    6: "4",
    7: "5",
    8: "5",
    9: "2",
    10: "1",
    11: "5",
    12: "2",
    13: "4",
    14: "2",
    15: "1",
    16: "2",
    17: "6",
    18: "133",
    19: "8",
    20: "85",
    21: "42",
    22: "38",
}

ELECTIVE_ANSWERS_2026_JUNE = {
    "probability": {23: "3", 24: "4", 25: "3", 26: "5", 27: "1", 28: "5", 29: "44", 30: "115"},
    "calculus": {23: "1", 24: "2", 25: "4", 26: "2", 27: "3", 28: "1", 29: "109", 30: "25"},
    "geometry": {23: "2", 24: "4", 25: "2", 26: "1", 27: "3", 28: "4", 29: "20", 30: "36"},
}

COMMON_ANSWERS_2027_JUNE = {
    1: "2",
    2: "5",
    3: "4",
    4: "3",
    5: "1",
    6: "1",
    7: "2",
    8: "4",
    9: "3",
    10: "3",
    11: "1",
    12: "1",
    13: "5",
    14: "3",
    15: "4",
    16: "2",
    17: "10",
    18: "15",
    19: "9",
    20: "48",
    21: "11",
    22: "32",
}

ELECTIVE_ANSWERS_2027_JUNE = {
    "probability": {23: "3", 24: "2", 25: "1", 26: "5", 27: "4", 28: "3", 29: "98", 30: "780"},
    "calculus": {23: "4", 24: "3", 25: "2", 26: "5", 27: "1", 28: "3", 29: "54", 30: "20"},
    "geometry": {23: "5", 24: "3", 25: "3", 26: "1", 27: "2", 28: "4", 29: "14", 30: "29"},
}

EXAMS = {
    "2026-june": {
        "subtitle": "2025년 6월 4일 시행 · 문항 단위 구조화 + 내장 폰트 재구성",
        "common_answers": COMMON_ANSWERS_2026_JUNE,
        "elective_answers": ELECTIVE_ANSWERS_2026_JUNE,
        "tracks": {
            "probability": {
                "id": "kice-2026-june-math-probability",
                "title": "2026학년도 6월 모의평가 수학 · 확률과 통계",
                "section": "확률과 통계",
                "pages": set(range(8, 12)),
            },
            "calculus": {
                "id": "kice-2026-june-math",
                "title": "2026학년도 6월 모의평가 수학 · 미적분",
                "section": "미적분",
                "pages": set(range(12, 16)),
            },
            "geometry": {
                "id": "kice-2026-june-math-geometry",
                "title": "2026학년도 6월 모의평가 수학 · 기하",
                "section": "기하",
                "pages": set(range(16, 20)),
            },
        },
    },
    "2027-june": {
        "subtitle": "2026년 6월 4일 시행 · 문항 단위 구조화 + 내장 폰트 재구성",
        "release_at": "2026-06-04T16:00:00+09:00",
        "common_answers": COMMON_ANSWERS_2027_JUNE,
        "elective_answers": ELECTIVE_ANSWERS_2027_JUNE,
        "tracks": {
            "probability": {
                "id": "kice-2027-june-math-probability",
                "title": "2027학년도 6월 모의평가 수학 · 확률과 통계",
                "section": "확률과 통계",
                "pages": set(range(8, 12)),
            },
            "calculus": {
                "id": "kice-2027-june-math",
                "title": "2027학년도 6월 모의평가 수학 · 미적분",
                "section": "미적분",
                "pages": set(range(12, 16)),
            },
            "geometry": {
                "id": "kice-2027-june-math-geometry",
                "title": "2027학년도 6월 모의평가 수학 · 기하",
                "section": "기하",
                "pages": set(range(16, 20)),
            },
        },
    },
}

COLS = {
    "left": (66.0, 418.0),
    "right": (418.0, 776.0),
}

GLYPH_DISPLAY_MAP = {
    "\ue03d": "0",
    "\ue034": "1",
    "\ue035": "2",
    "\ue036": "3",
    "\ue037": "4",
    "\ue038": "5",
    "\ue039": "6",
    "\ue03a": "7",
    "\ue03b": "8",
    "\ue03c": "9",
    "\ue0fc": "x",
    "\ue0fd": "y",
    "\ue0e5": "a",
    "\ue0e6": "b",
    "\ue0e7": "c",
    "\ue0e8": "d",
    "\ue0ec": "h",
    "\ue0ef": "k",
    "\ue0f2": "n",
    "\ue0ea": "f",
    "\ue0eb": "g",
    "\ue0a4": "θ",
    "\ue0ac": "π",
    "\ue044": "(",
    "\ue045": ")",
    "\ue046": "-",
    "\ue047": "=",
    "\ue048": "+",
    "\ue055": "<",
    "\ue056": ">",
    "\ue05b": "∫",
    "\ue067": "∑",
    "\ue06d": "—",
    "\ue05c": "√",
    "\ue052": ",",
}

GLYPH_LATEX_MAP = {
    **GLYPH_DISPLAY_MAP,
    "\ue0a4": r"\theta ",
    "\ue0ac": r"\pi ",
    "\ue05b": r"\int ",
    "\ue067": r"\sum ",
    "\ue06d": "",
    "\ue05c": r"\sqrt ",
}


@dataclass(frozen=True)
class Start:
    page_index: int
    number: int
    x: float
    y: float
    col: str


def clean_text(text: str) -> str:
    text = normalize_glyphs(text, fallback="□")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_glyphs(text: str, fallback: str = "", latex: bool = False) -> str:
    glyph_map = GLYPH_LATEX_MAP if latex else GLYPH_DISPLAY_MAP
    out = []
    for char in text:
        if char in glyph_map:
            out.append(glyph_map[char])
        elif "\ue000" <= char <= "\uf8ff":
            out.append(fallback)
        else:
            out.append(char)
    return "".join(out)


def latex_from_text(text: str) -> str:
    text = normalize_glyphs(text, fallback="", latex=True)
    replacements = {
        "×": r"\times ",
        "≥": r"\ge ",
        "≤": r"\le ",
        "→": r"\to ",
        "′": "'",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"([a-zA-Z])([0-9])", r"\1^{\2}", text)
    return text


def latex_snippets(text: str) -> list[str]:
    normalized = latex_from_text(text)
    normalized = re.sub(r"^\d+\.\s*", "", normalized)
    parts = re.split(r"[가-힣①②③④⑤\[\]?,]+", normalized)
    snippets = []
    for part in parts:
        part = part.strip(" .")
        if not part:
            continue
        if not re.search(r"\\pi|\\theta|\\int|\\sum|sin|cos|tan|log|lim|[=+\\-×<>]|[0-9][a-z]", part):
            continue
        if part not in snippets:
            snippets.append(part)
    return snippets


def math_blocks(page: fitz.Page, rect: fitz.Rect) -> list[dict]:
    blocks = []
    seen = set()
    for line in page.get_text("dict", clip=rect)["blocks"]:
        for item in line.get("lines", []):
            source = "".join(span.get("text", "") for span in item.get("spans", [])).strip()
            if not source:
                continue
            normalized = normalize_glyphs(source)
            looks_math = bool(re.search(r"[=+\\-×<>]|sin|cos|tan|log|lim|\\\\sum|\\\\int|\\\\pi|\\\\theta|[a-z][()]?", normalized))
            if not looks_math:
                continue
            for latex in latex_snippets(source):
                if not latex or latex in seen:
                    continue
                seen.add(latex)
                blocks.append({"source": clean_text(source), "latex": latex})
    return blocks[:10]


def flatten_spans(content: dict) -> list[dict]:
    spans = []
    for line in content["lines"]:
        for span in line["spans"]:
            item = dict(span)
            item["cx"] = item["x"] + item["width"] / 2
            item["cy"] = item["y"] + item["height"] / 2
            spans.append(item)
    return spans


def overlapping_center(spans: list[dict], bar: dict, above: bool) -> str:
    candidates = []
    for span in spans:
        if span is bar:
            continue
        if above and not (span["cy"] < bar["cy"]):
            continue
        if not above and not (span["cy"] > bar["cy"]):
            continue
        if abs(span["cy"] - bar["cy"]) > 14:
            continue
        if re.match(r"^\d+\.$", span["text"].strip()) or span["text"].strip() in {"①", "②", "③", "④", "⑤"}:
            continue
        if abs(span["cx"] - bar["cx"]) <= max(4.5, bar["width"] * 0.9):
            candidates.append(span)
    candidates.sort(key=lambda item: (item["x"], item["y"]))
    return "".join(item["text"].strip() for item in candidates)


def reconstruct_power_fractions(content: dict) -> str | None:
    spans = flatten_spans(content)
    all_text = "".join(span["text"] for span in spans)
    if "lim" in all_text or "∫" in all_text or "∑" in all_text:
        return None
    choice_ys = [span["cy"] for span in spans if span["text"].strip() in {"①", "②", "③", "④", "⑤"}]
    first_choice_y = min(choice_ys) if choice_ys else 10_000
    bars = [span for span in spans if span["text"].strip() == "—" and span["cy"] < first_choice_y - 8]
    if not bars:
        return None
    terms = []
    used_bars = set()
    for bar in sorted(bars, key=lambda item: item["x"]):
        numerator = overlapping_center(spans, bar, above=True)
        denominator = overlapping_center(spans, bar, above=False)
        if not numerator or not denominator:
            continue
        previous = [
            span
            for span in spans
            if span["x"] < bar["x"]
            and 0 <= bar["x"] - (span["x"] + span["width"]) <= 7
            and abs(span["cy"] - (bar["cy"] + 8)) < 18
            and re.search(r"[0-9a-zA-Z]$", span["text"].strip())
            and not span["text"].strip().startswith(("①", "②", "③", "④", "⑤"))
        ]
        if not previous:
            continue
        base_span = sorted(previous, key=lambda item: item["x"])[-1]
        base_text = base_span["text"].strip()
        operator = ""
        base_match = re.search(r"([×+\-])?([0-9a-zA-Z]+)$", base_text)
        if base_match:
            operator = base_match.group(1) or ""
            base = base_match.group(2)
        else:
            base = base_text[-1:]
        term = f"{base}^{{\\frac{{{numerator}}}{{{denominator}}}}}"
        if operator == "×":
            term = r"\times " + term
        elif operator:
            term = operator + term
        terms.append(term)
        used_bars.add(id(bar))
    return " ".join(terms) if terms else None


def reconstruct_limit_fraction(content: dict) -> str | None:
    spans = flatten_spans(content)
    all_text = "".join(span["text"] for span in spans)
    if "lim" not in all_text:
        return None
    bars = [span for span in spans if span["text"].strip() == "—" and span["width"] > 24]
    if not bars:
        return None
    bar = sorted(bars, key=lambda item: item["width"], reverse=True)[0]
    numerator = [
        span
        for span in spans
        if span["cy"] < bar["cy"]
        and abs(span["cy"] - bar["cy"]) < 24
        and span["x"] >= bar["x"] - 4
        and span["x"] <= bar["x"] + bar["width"] + 4
        and span["text"].strip()
        and not re.search(r"[가-힣]", span["text"])
    ]
    denominator = [
        span
        for span in spans
        if span["cy"] > bar["cy"]
        and abs(span["cy"] - bar["cy"]) < 24
        and span["x"] >= bar["x"] - 4
        and span["x"] <= bar["x"] + bar["width"] + 4
        and span["text"].strip()
        and not span["text"].strip().startswith(("①", "②", "③", "④", "⑤"))
    ]
    subscript = [span for span in spans if span["x"] < bar["x"] and span["cy"] > bar["cy"] and "→" in span["text"]]
    numerator.sort(key=lambda item: item["x"])
    denominator.sort(key=lambda item: item["x"])
    subscript.sort(key=lambda item: item["x"])
    num = latex_from_text("".join(span["text"] for span in numerator))
    den = latex_from_text("".join(span["text"] for span in denominator))
    sub = latex_from_text("".join(span["text"] for span in subscript)).replace("→", r"\to ")
    if not num or not den:
        return None
    sub = sub or r"h\to 0"
    return rf"\lim_{{{sub}}}\frac{{{num}}}{{{den}}}"


def choice_blocks(content: dict) -> list[dict]:
    choices = []
    flat = flatten_spans(content)
    labels = ["①", "②", "③", "④", "⑤"]
    label_positions = sorted([span for span in flat if span["text"].strip() in labels], key=lambda item: (item["cy"], item["x"]))
    for label in labels:
        label_spans = [span for span in label_positions if span["text"].strip() == label]
        if not label_spans:
            continue
        label_span = label_spans[0]
        next_labels = [span for span in label_positions if span["x"] > label_span["x"] and abs(span["cy"] - label_span["cy"]) < 8]
        x_limit = next_labels[0]["x"] - 2 if next_labels else label_span["x"] + 90
        region = [
            span
            for span in flat
            if abs(span["cy"] - label_span["cy"]) < 20 and span["x"] > label_span["x"] and span["x"] < x_limit
        ]
        region.sort(key=lambda item: (item["y"], item["x"]))
        text = "".join(span["text"].strip() for span in region if span["text"].strip() not in labels)
        latex = latex_for_choice_region(region)
        choices.append({"label": label, "text": text, "latex": latex or (latex_from_text(text) if text else None)})
    return choices


def latex_for_choice_region(region: list[dict]) -> str | None:
    items = [span for span in region if span["text"].strip() not in {"①", "②", "③", "④", "⑤"}]
    bars = [span for span in items if span["text"].strip() == "—"]
    if not bars:
        text = "".join(span["text"].strip() for span in sorted(items, key=lambda item: item["x"]))
        return latex_from_text(text) if text else None
    bar = sorted(bars, key=lambda item: item["width"], reverse=True)[0]
    if bar["width"] < 12:
        return None
    sign = "-" if any(span["text"].strip() == "-" for span in items) else ""
    sqrt_spans = [span for span in items if span["text"].strip() == "√" and span["cy"] < bar["cy"]]
    if sqrt_spans:
        sqrt_span = sqrt_spans[0]
        radicand = [
            span
            for span in items
            if span["text"].strip().isdigit()
            and span["x"] > sqrt_span["x"]
            and span["cy"] < bar["cy"]
            and abs(span["cy"] - sqrt_span["cy"]) < 12
        ]
        radicand.sort(key=lambda item: item["x"])
        numerator = r"\sqrt{" + ("".join(span["text"].strip() for span in radicand) or "?") + "}"
    else:
        numerator_items = [span for span in items if span["cy"] < bar["cy"] and span["text"].strip() not in {"-", "—"}]
        numerator_items.sort(key=lambda item: item["x"])
        numerator = "".join(span["text"].strip() for span in numerator_items)
    denominator_items = [span for span in items if span["cy"] > bar["cy"] and abs(span["cy"] - bar["cy"]) < 22 and span["text"].strip().isdigit()]
    denominator_items.sort(key=lambda item: item["x"])
    denominator = "".join(span["text"].strip() for span in denominator_items)
    if not numerator or not denominator:
        return None
    return rf"{sign}\frac{{{numerator}}}{{{denominator}}}"


def render_blocks(problem_number: int, content: dict, extracted_text: str, math: list[dict]) -> list[dict]:
    blocks = []
    limit_fraction = reconstruct_limit_fraction(content)
    power_fraction = None if limit_fraction else reconstruct_power_fractions(content)
    if power_fraction:
        blocks.append({"kind": "math", "latex": power_fraction})
        tail = re.sub(r"^.*?의 값은", "의 값은", extracted_text)
        tail = re.sub(r"①.*$", "", tail).strip()
        if tail:
            blocks.append({"kind": "text", "text": tail})
    elif limit_fraction:
        statement = re.sub(r"\s*lim.*$", "", re.sub(r"①.*$", "", extracted_text)).strip()
        match = re.match(r"^(\d+\.\s*함수\s*)(.+?)(에 대하여)$", statement)
        if match:
            blocks.append({"kind": "text", "text": match.group(1).strip()})
            blocks.append({"kind": "math", "latex": latex_from_text(match.group(2))})
            blocks.append({"kind": "text", "text": match.group(3)})
        elif statement:
            blocks.append({"kind": "text", "text": statement})
        blocks.append({"kind": "math", "latex": limit_fraction})
        blocks.append({"kind": "text", "text": "의 값은? [2점]"})
    else:
        statement = re.sub(r"①.*$", "", extracted_text).strip()
        if statement:
            blocks.append({"kind": "text", "text": statement})
        for item in math[:4]:
            blocks.append({"kind": "math", "latex": item["latex"]})
    choices = choice_blocks(content)
    if choices:
        blocks.append({"kind": "choices", "choices": choices})
    return blocks


def font_family(name: str) -> str:
    name = name.split("+")[-1]
    return name.lstrip("*").replace(" ", "_")


def line_text(line: dict) -> str:
    return "".join(span["text"] for span in line.get("spans", [])).strip()


def find_problem_starts(doc: fitz.Document) -> list[Start]:
    starts: list[Start] = []
    for page_index, page in enumerate(doc):
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = line_text(line)
                match = re.match(r"^([1-9]|[12][0-9]|30)\.", text)
                if not match:
                    continue
                x0, y0, *_ = line["bbox"]
                # Ignore footer or accidental answer-choice numbering.
                if y0 > 1040:
                    continue
                col = "left" if x0 < 418 else "right"
                starts.append(Start(page_index, int(match.group(1)), x0, y0, col))
    starts.sort(key=lambda item: (item.page_index, item.x, item.y))
    return starts


def problem_rect(page: fitz.Page, start: Start, starts: list[Start]) -> fitz.Rect:
    col_x0, col_x1 = COLS[start.col]
    same_col_after = [
        item for item in starts if item.page_index == start.page_index and item.col == start.col and item.y > start.y + 8
    ]
    y0 = max(145.0, start.y - 18.0)
    y1 = min(page.rect.height - 230.0, same_col_after[0].y - 20.0 if same_col_after else page.rect.height - 230.0)
    rough = fitz.Rect(col_x0, y0, col_x1, y1)
    content_bottom = y0 + 120.0
    for block in page.get_text("dict", clip=rough)["blocks"]:
        bx0, by0, bx1, by1 = block["bbox"]
        if by0 < y0 - 1 or bx1 < col_x0 or bx0 > col_x1:
            continue
        content_bottom = max(content_bottom, by1)
    return fitz.Rect(col_x0, y0, col_x1, min(y1, content_bottom + 34.0))


def extract_fonts(doc: fitz.Document, exam_dir: Path) -> list[dict]:
    fonts_dir = exam_dir / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, str] = {}
    for page in doc:
        for font in page.get_fonts(full=True):
            xref = font[0]
            try:
                name, ext, _font_type, data = doc.extract_font(xref)
            except Exception:
                continue
            if ext not in {"ttf", "otf"} or not data:
                continue
            family = font_family(name)
            if family in written:
                continue
            file_name = f"{family}.{ext}"
            (fonts_dir / file_name).write_bytes(data)
            written[family] = file_name
    return [{"family": family, "file": file_name} for family, file_name in sorted(written.items())]


def structured_content(page: fitz.Page, rect: fitz.Rect) -> dict:
    lines = []
    for block in page.get_text("dict", clip=rect)["blocks"]:
        for line in block.get("lines", []):
            spans = []
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text:
                    continue
                x0, y0, x1, y1 = span["bbox"]
                if x1 < rect.x0 or x0 > rect.x1 or y1 < rect.y0 or y0 > rect.y1:
                    continue
                spans.append(
                    {
                        "text": normalize_glyphs(text),
                        "x": round(x0 - rect.x0, 2),
                        "y": round(y0 - rect.y0, 2),
                        "width": round(x1 - x0, 2),
                        "height": round(y1 - y0, 2),
                        "font": font_family(span.get("font", "")),
                        "size": round(float(span.get("size", 12)), 2),
                        "flags": int(span.get("flags", 0)),
                    }
                )
            if not spans:
                continue
            x0, y0, x1, y1 = line["bbox"]
            lines.append(
                {
                    "x": round(x0 - rect.x0, 2),
                    "y": round(y0 - rect.y0, 2),
                    "width": round(x1 - x0, 2),
                    "height": round(y1 - y0, 2),
                    "spans": spans,
                }
            )
    return {"width": round(rect.width, 2), "height": round(rect.height, 2), "lines": lines}


def answer_kind(number: int) -> str:
    if number <= 15:
        return "choice"
    if 23 <= number <= 28:
        return "choice"
    return "short"


def difficulty(number: int) -> int:
    if number <= 6:
        return 1
    if number <= 12:
        return 2
    if number <= 17:
        return 3
    if number <= 22:
        return 4
    if number <= 26:
        return 3
    if number <= 28:
        return 4
    return 5


def selected_starts(all_starts: list[Start], track: dict) -> list[Start]:
    selected = []
    for start in all_starts:
        if 1 <= start.number <= 22 and start.page_index <= 7:
            selected.append(start)
        elif 23 <= start.number <= 30 and start.page_index in track["pages"]:
            selected.append(start)
    selected.sort(key=lambda item: (item.number, item.page_index, item.x, item.y))
    deduped: list[Start] = []
    seen: set[int] = set()
    for start in selected:
        if start.number in seen:
            continue
        seen.add(start.number)
        deduped.append(start)
    return deduped


def write_track(doc: fitz.Document, all_starts: list[Start], output_root: Path, exam: dict, track_key: str) -> None:
    track = exam["tracks"][track_key]
    exam_dir = output_root / track["id"]
    problems_dir = exam_dir / "problems"
    if exam_dir.exists():
        shutil.rmtree(exam_dir)
    problems_dir.mkdir(parents=True)
    fonts = extract_fonts(doc, exam_dir)

    problems = []
    answers = {**exam["common_answers"], **exam["elective_answers"][track_key]}
    starts = selected_starts(all_starts, track)
    if len(starts) != 30:
        raise RuntimeError(f"{track_key}: expected 30 problems, found {len(starts)}")

    for start in starts:
        page = doc[start.page_index]
        rect = problem_rect(page, start, all_starts)
        pix = page.get_pixmap(matrix=fitz.Matrix(2.4, 2.4), clip=rect, alpha=False)
        image_name = f"{start.number:03}.png"
        pix.save(problems_dir / image_name)
        extracted = clean_text(page.get_text("text", clip=rect))
        content = structured_content(page, rect)
        math = math_blocks(page, rect)
        section = "공통" if start.number <= 22 else track["section"]
        problems.append(
            {
                "id": f"p{start.number:03}",
                "number": start.number,
                "title": f"{section} {start.number}번",
                "answerKind": answer_kind(start.number),
                "answer": answers[start.number],
                "difficulty": difficulty(start.number),
                "image": image_name,
                "text": extracted,
                "sourcePage": start.page_index + 1,
                "bbox": [round(rect.x0, 1), round(rect.y0, 1), round(rect.x1, 1), round(rect.y1, 1)],
                "section": section,
                "content": content,
                "math": math,
                "renderBlocks": render_blocks(start.number, content, extracted, math),
            }
        )

    manifest = {
        "id": track["id"],
        "title": track["title"],
        "subtitle": exam["subtitle"],
        "timeLimitSec": 2400,
        "fonts": fonts,
        "problems": problems,
    }
    if exam.get("release_at"):
        manifest["releaseAt"] = exam["release_at"]
    (exam_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    if len(sys.argv) not in {3, 4}:
        print("usage: prepare_kice_math_problems.py input.pdf server_exams_dir [2026-june|2027-june]", file=sys.stderr)
        return 2
    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    output_root = Path(sys.argv[2]).expanduser().resolve()
    exam_key = sys.argv[3] if len(sys.argv) == 4 else "2026-june"
    if exam_key not in EXAMS:
        print(f"unknown exam key: {exam_key}", file=sys.stderr)
        return 2
    exam = EXAMS[exam_key]
    output_root.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    starts = find_problem_starts(doc)
    for track_key in exam["tracks"]:
        write_track(doc, starts, output_root, exam, track_key)
    print("wrote problem-level KICE math exams:", ", ".join(exam["tracks"][key]["id"] for key in exam["tracks"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
