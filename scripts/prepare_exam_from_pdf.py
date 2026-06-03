#!/usr/bin/env python3
"""
Turn an exam PDF into server exam assets by capturing each problem bbox.

Run with:
  conda run -n mlenv python scripts/prepare_exam_from_pdf.py input.pdf server/exams/my-exam

This intentionally does not reconstruct formulas. Math PDFs often encode
formulas as layout glyphs, so the cropped problem image is the authoritative
problem display. The script only keeps light text metadata for search/debugging.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CHOICE_LABELS = {"①", "②", "③", "④", "⑤"}
KICE_COLS = {"left": (66.0, 418.0), "right": (418.0, 776.0)}

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
    "\ue0e9": "e",
    "\ue0ea": "f",
    "\ue0eb": "g",
    "\ue0ec": "h",
    "\ue0ef": "k",
    "\ue0f2": "n",
    "\ue0f4": "p",
    "\ue0f5": "q",
    "\ue0f6": "r",
    "\ue0f8": "t",
    "\ue09d": "m",
    "\ue09e": "n",
    "\ue0a4": "θ",
    "\ue0ac": "π",
    "\ue044": "(",
    "\ue045": ")",
    "\ue046": "-",
    "\ue047": "=",
    "\ue048": "+",
    "\ue052": ",",
    "\ue055": "<",
    "\ue056": ">",
    "\ue04b": "{",
    "\ue04c": "}",
    "\ue04f": ":",
    "\ue05b": "∫",
    "\ue05c": "√",
    "\ue067": "∑",
    "\ue06d": "—",
    "\ue06e": "→",
    "\ue078": "{",
    "\ue079": "",
    "\ue07a": "",
    "\ue07b": "",
    "\ue101": "|",
    "\ue000": "A",
    "\ue001": "B",
    "\ue002": "C",
    "\ue012": "L",
    "\ue017": "X",
}


@dataclass(frozen=True)
class ProblemStart:
    page_index: int
    source_number: int
    x: float
    y: float
    col: str


def normalize_glyphs(text: str, fallback: str = "") -> str:
    out = []
    for char in text:
        if char in GLYPH_DISPLAY_MAP:
            out.append(GLYPH_DISPLAY_MAP[char])
        elif "\ue000" <= char <= "\uf8ff":
            out.append(fallback)
        else:
            out.append(char)
    return "".join(out)


def clean_text(text: str) -> str:
    text = normalize_glyphs(text, fallback="□")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.?])", r"\1", text)
    return text.strip()


def line_text(line: dict[str, Any]) -> str:
    return "".join(span.get("text", "") for span in line.get("spans", [])).strip()


def find_problem_starts(doc: Any) -> list[ProblemStart]:
    starts: list[ProblemStart] = []
    for page_index, page in enumerate(doc):
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                text = normalize_glyphs(line_text(line))
                match = re.match(r"^([1-9]|[12][0-9]|30)\.", text)
                if not match:
                    continue
                x0, y0, *_ = line["bbox"]
                if y0 > page.rect.height - 90:
                    continue
                col = "left" if x0 < page.rect.width / 2 else "right"
                starts.append(ProblemStart(page_index, int(match.group(1)), x0, y0, col))
    starts.sort(key=lambda item: (item.page_index, item.x, item.y))
    return starts


def problem_rect(page: Any, start: ProblemStart, starts: list[ProblemStart]) -> Any:
    import fitz

    if page.rect.width > 700:
        col_x0, col_x1 = KICE_COLS[start.col]
    else:
        margin = page.rect.width * 0.06
        mid = page.rect.width / 2
        col_x0, col_x1 = (margin, mid) if start.col == "left" else (mid, page.rect.width - margin)

    same_col_after = [
        item
        for item in starts
        if item.page_index == start.page_index and item.col == start.col and item.y > start.y + 8
    ]
    y0 = max(0.0, start.y - 18.0)
    y1 = same_col_after[0].y - 20.0 if same_col_after else page.rect.height - 90.0
    rough = fitz.Rect(col_x0, y0, col_x1, min(page.rect.height, y1))

    content_bottom = y0 + 120.0
    for block in page.get_text("dict", clip=rough)["blocks"]:
        bx0, by0, bx1, by1 = block["bbox"]
        if by0 < y0 - 1 or bx1 < col_x0 or bx0 > col_x1:
            continue
        content_bottom = max(content_bottom, by1)

    return fitz.Rect(col_x0, y0, col_x1, min(rough.y1, content_bottom + 34.0))


def answer_kind_from_text(source_number: int, text: str) -> str:
    if source_number <= 15 or len([label for label in CHOICE_LABELS if label in text]) >= 3:
        return "choice"
    return "short"


def difficulty(source_number: int) -> int:
    if source_number <= 6:
        return 1
    if source_number <= 12:
        return 2
    if source_number <= 17:
        return 3
    if source_number <= 22:
        return 4
    if source_number <= 28:
        return 4
    return 5


def crop_quality(page: Any, rect: Any, text: str) -> dict[str, Any]:
    warnings = []
    area_ratio = (rect.width * rect.height) / (page.rect.width * page.rect.height)
    if rect.width < page.rect.width * 0.2:
        warnings.append("crop is unusually narrow")
    if rect.height < 80:
        warnings.append("crop is unusually short")
    if area_ratio > 0.55:
        warnings.append("crop covers more than half the page")
    if len(text) < 8:
        warnings.append("text layer is very short; image may still be usable")
    if any(label in text for label in CHOICE_LABELS) and len([label for label in CHOICE_LABELS if label in text]) not in {0, 5}:
        warnings.append("choice labels look incomplete inside crop")
    score = max(0, 100 - len(warnings) * 25)
    return {"score": score, "usable": score >= 75, "warnings": warnings}


def build_problem(page: Any, rect: Any, manifest_number: int, source_number: int, image_name: str) -> dict[str, Any]:
    text = clean_text(page.get_text("text", clip=rect))
    return {
        "id": f"p{manifest_number:03}",
        "number": manifest_number,
        "title": f"{source_number}번",
        "answerKind": answer_kind_from_text(source_number, text),
        "answer": "",
        "difficulty": difficulty(source_number),
        "image": image_name,
        "text": text,
        "sourceNumber": source_number,
        "sourcePage": page.number + 1,
        "bbox": [round(rect.x0, 1), round(rect.y0, 1), round(rect.x1, 1), round(rect.y1, 1)],
        "captureQuality": crop_quality(page, rect, text),
    }


def summarize_capture(problems: list[dict[str, Any]], mode: str) -> dict[str, Any]:
    scores = [problem["captureQuality"]["score"] for problem in problems]
    warnings = sum(len(problem["captureQuality"]["warnings"]) for problem in problems)
    unusable = [problem["number"] for problem in problems if not problem["captureQuality"]["usable"]]
    return {
        "mode": mode,
        "problemCount": len(problems),
        "averageScore": round(sum(scores) / len(scores), 1) if scores else 0,
        "warningCount": warnings,
        "unusableProblems": unusable,
    }


def write_manifest(pdf_path: Path, output_dir: Path, doc: Any) -> int:
    import fitz

    if output_dir.exists():
        shutil.rmtree(output_dir)
    problems_dir = output_dir / "problems"
    problems_dir.mkdir(parents=True, exist_ok=True)

    starts = find_problem_starts(doc)
    use_problem_crops = len(starts) >= 3
    problems = []

    if use_problem_crops:
        deduped = []
        seen: set[tuple[int, int]] = set()
        for start in starts:
            key = (start.page_index, start.source_number)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(start)

        for manifest_number, start in enumerate(deduped, start=1):
            page = doc[start.page_index]
            rect = problem_rect(page, start, starts)
            image_name = f"{manifest_number:03}.png"
            page.get_pixmap(matrix=fitz.Matrix(2.4, 2.4), clip=rect, alpha=False).save(problems_dir / image_name)
            problems.append(build_problem(page, rect, manifest_number, start.source_number, image_name))
        mode = "problem-bbox"
    else:
        for manifest_number, page in enumerate(doc, start=1):
            rect = page.rect
            image_name = f"{manifest_number:03}.png"
            page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(problems_dir / image_name)
            problems.append(build_problem(page, rect, manifest_number, manifest_number, image_name))
        mode = "page"

    manifest = {
        "id": output_dir.name,
        "title": pdf_path.stem,
        "subtitle": "운영자 준비 시험지 · 문항 bbox 캡처",
        "timeLimitSec": 2400,
        "captureSummary": summarize_capture(problems, mode),
        "problems": problems,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return len(problems)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: prepare_exam_from_pdf.py input.pdf output_exam_dir", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    output_dir = Path(sys.argv[2]).expanduser().resolve()

    try:
        import fitz  # noqa: F401
    except ImportError:
        print("PyMuPDF is required in mlenv: conda run -n mlenv python -m pip install pymupdf", file=sys.stderr)
        return 1

    import fitz

    doc = fitz.open(pdf_path)
    count = write_manifest(pdf_path, output_dir, doc)
    summary = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))["captureSummary"]
    print(f"wrote {count} assets and manifest to {output_dir}")
    print(
        "capture quality:",
        f"mode={summary['mode']}",
        f"average={summary['averageScore']}",
        f"warnings={summary['warningCount']}",
        f"unusable={summary['unusableProblems'][:12]}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
