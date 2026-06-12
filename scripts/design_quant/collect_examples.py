from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path


WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php"

POSITIVE_TERMS = [
    "minimalist user interface",
    "Swiss graphic design poster",
    "Bauhaus typography poster",
    "wayfinding signage pictogram",
    "information design diagram",
    "clean dashboard interface",
]

NEGATIVE_TERMS = [
    "cluttered interface",
    "bad user interface",
    "confusing sign",
    "visual clutter",
    "crowded dashboard",
    "bad design signage",
]

TAG_RE = re.compile(r"<[^>]+>")


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "kice-arena-design-quant/0.1"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def clean_metadata(value: str) -> str:
    return " ".join(TAG_RE.sub("", value).split())


def wikimedia_search(term: str, limit: int, offset: int = 0) -> list[dict]:
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": f"filetype:bitmap {term}",
        "gsrnamespace": "6",
        "gsrlimit": str(min(limit, 50)),
        "gsroffset": str(offset),
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "format": "json",
        "formatversion": "2",
    }
    data = fetch_json(f"{WIKIMEDIA_API}?{urllib.parse.urlencode(params)}")
    pages = data.get("query", {}).get("pages", [])
    rows: list[dict] = []
    for page in pages:
        image_info = (page.get("imageinfo") or [{}])[0]
        url = image_info.get("url")
        mime = image_info.get("mime", "")
        if not url or not mime.startswith("image/"):
            continue
        metadata = image_info.get("extmetadata", {})
        rows.append(
            {
                "source": "wikimedia_commons",
                "searchTerm": term,
                "title": page.get("title", ""),
                "url": url,
                "pageUrl": image_info.get("descriptionurl", ""),
                "mime": mime,
                "license": clean_metadata(metadata.get("LicenseShortName", {}).get("value", "")),
                "artist": clean_metadata(metadata.get("Artist", {}).get("value", "")),
            }
        )
    return rows


def collect_label(label: str, terms: list[str], target: int) -> list[dict]:
    seen: set[str] = set()
    examples: list[dict] = []
    offset = 0
    while len(examples) < target and offset < 500:
        for term in terms:
            if len(examples) >= target:
                break
            for row in wikimedia_search(term, 50, offset):
                if row["url"] in seen:
                    continue
                seen.add(row["url"])
                row["label"] = label
                examples.append(row)
                if len(examples) >= target:
                    break
            time.sleep(0.2)
        offset += 50
    return examples


def main() -> int:
    parser = argparse.ArgumentParser(description="Build public UI example URL manifests.")
    parser.add_argument("--output", required=True, help="Path to write the JSON manifest.")
    parser.add_argument("--per-label", type=int, default=120)
    args = parser.parse_args()

    positive = collect_label("positive_minimal", POSITIVE_TERMS, args.per_label)
    negative = collect_label("negative_cluttered", NEGATIVE_TERMS, args.per_label)
    manifest = {
        "schema": "kice.designExamples.v1",
        "minimumRecommendedPerLabel": 100,
        "examples": positive + negative,
        "counts": {
            "positive_minimal": len(positive),
            "negative_cluttered": len(negative),
        },
        "notes": [
            "Manifest stores source URLs, not copied images.",
            "Review licenses before caching images for offline use.",
        ],
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest["counts"], ensure_ascii=False))
    if len(positive) < 100 or len(negative) < 100:
        raise SystemExit("fewer than 100 examples found for at least one label")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
