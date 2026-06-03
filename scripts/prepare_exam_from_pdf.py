#!/usr/bin/env python3
"""
Operator-only helper for turning a preapproved exam PDF into server exam assets.

Run with:
  conda run -n mlenv python scripts/prepare_exam_from_pdf.py input.pdf server/exams/my-exam

This first-pass tool renders pages into images and writes a manifest skeleton.
Problem-level crops can then be produced by replacing the generated page images
with manually cropped problem images and editing manifest.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: prepare_exam_from_pdf.py input.pdf output_exam_dir", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    output_dir = Path(sys.argv[2]).expanduser().resolve()
    problems_dir = output_dir / "problems"
    problems_dir.mkdir(parents=True, exist_ok=True)

    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("PyMuPDF is required in mlenv: conda run -n mlenv python -m pip install pymupdf", file=sys.stderr)
        return 1

    doc = fitz.open(pdf_path)
    problems = []
    for index, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image_name = f"{index:03}.png"
        pix.save(problems_dir / image_name)
        problems.append(
            {
                "id": f"p{index:03}",
                "number": index,
                "title": f"{index}번 페이지",
                "answerKind": "choice",
                "answer": "",
                "difficulty": 1,
                "image": image_name,
            }
        )

    manifest = {
        "id": output_dir.name,
        "title": pdf_path.stem,
        "subtitle": "운영자 준비 시험지",
        "timeLimitSec": 2400,
        "problems": problems,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(problems)} page images and manifest to {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
