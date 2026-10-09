"""Extract room labels and render the six source PDF pages for the static site.

Requires PyMuPDF and Pillow. Label coordinates are not door coordinates.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PDF = next((ROOT / "assets").glob("**/躬行楼地图.pdf"))
OUT = ROOT / "public" / "maps"
DATA = ROOT / "public" / "data"
ROOM_RE = re.compile(r"([1-6](?:F)?)-\s*(\d{3})([A-Z]?)")


def extract_rooms(page, floor: int):
    found = {}
    for block in page.get_text("rawdict")["blocks"]:
        if "lines" not in block:
            continue
        chars = []
        for line in block["lines"]:
            for span in line["spans"]:
                chars.extend(span["chars"])
            chars.append({"c": "\n", "bbox": None})
        source = "".join(char["c"] for char in chars)
        for match in ROOM_RE.finditer(source):
            if int(match.group(1)[0]) != floor:
                continue
            label = f"{match.group(1)}-{match.group(2)}{match.group(3)}"
            boxes = [c["bbox"] for c in chars[match.start():match.end()] if c["bbox"]]
            if not boxes:
                continue
            x = (min(b[0] for b in boxes) + max(b[2] for b in boxes)) / 2 / page.rect.width
            y = (min(b[1] for b in boxes) + max(b[3] for b in boxes)) / 2 / page.rect.height
            if label not in found:
                found[label] = {
                    "id": label, "name": label, "floor": floor,
                    "labelPosition": {"x": round(x, 6), "y": round(y, 6)},
                    "entrancePosition": None, "accessNode": None,
                    "zone": None, "verified": False, "source": "PDF text layer",
                }
    return sorted(found.values(), key=lambda room: room["id"])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(PDF)
    if len(document) != 6:
        raise ValueError(f"Expected six floor plans, found {len(document)}")
    rooms, floors = [], []
    for index, page in enumerate(document):
        floor = index + 1
        scale = 2200 / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        image.save(OUT / f"{floor}f.webp", "WEBP", quality=87, method=6)
        extracted = extract_rooms(page, floor)
        rooms.extend(extracted)
        floors.append({"floor": floor, "image": f"maps/{floor}f.webp", "width": pix.width,
                       "height": pix.height, "pdfWidth": round(page.rect.width, 2),
                       "pdfHeight": round(page.rect.height, 2), "roomCount": len(extracted),
                       "drawings": len(page.get_drawings())})
        print(f"{floor}F: {len(extracted)} unique labels, {pix.width}x{pix.height}")
    (DATA / "rooms.json").write_text(json.dumps(rooms, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "floors.json").write_text(json.dumps(floors, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Total: {len(rooms)} unique room labels")


if __name__ == "__main__":
    main()
