#!/usr/bin/env python3
"""Extract commercial designation examples from existing NEXUS quote PDFs.

The output is intentionally structured for the next step: importing examples into
Qdrant, then using the closest examples as few-shot context for Gemma.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF

DEFAULT_BULK_DIR = Path("/apps/zeruxcom-v1/app/ressources/Bulk")
DEFAULT_OUTPUT = Path("/apps/zeruxcom-v1/app/iachat-v2/tmp/pdf_designations.json")

TITLE_RE = re.compile(r'^(?:BLOC[- ]PORTE|CHASSIS|GUICHET)\b.*\bNEXUS\b', re.I)
PRICE_RE = re.compile(r"^\d{1,3}(?:[ \u00a0]\d{3})*,\d{2}$")
QTY_RE = re.compile(r"^\d{1,3}$")
REP_RE = re.compile(r"^[A-Z]{1,4}\d?$", re.I)
DIM_RE = re.compile(r"\b(?:dimensions?|hors[- ]tout|sur mesure|passage libre|\bL\s*\d{3,4}\s*H\s*\d{3,4})\b", re.I)
PERF_RE = re.compile(r"\b(?:classement|performance|anti[- ]effraction|coupe[- ]feu|EI\s*[²2]?\s*\d+|CR\s*\d|RC\s*\d|FB\s*\d|acoustique|pression|Uw\s*=)\b", re.I)
EQUIP_RE = re.compile(r"\b(?:serrure|cylindre|ferme[- ]porte|garniture|cr[eé]mone|barre|b[eé]quille|ventouse|contact|vitrage|remplissage|seuil|joint|finitions?|thermolaquage|RAL|habillage|oculus|imposte|vantail|t[oô]le|dormant|paumelle|pose|passe[- ]cable|radar|ouvre[- ]porte)\b", re.I)
STOP_RE = re.compile(r"\b(?:OFFRE DE PRIX|SUITE PAGE SUIVANTE|FORFAIT PORT|MONTANT TOTAL|Total [eé]co|Cliquez ici|Bon pour accord|Conditions de r[eè]glement|Validit[eé] du devis|ZERUX FRANCE|SAS au capital|Page \d+/\d+)\b", re.I)
SKIP_RE = re.compile(r"^(?:OFFRE DE PRIX|REP\.|Q\.|P\.U HT|MONTANT HT|D[ÉE]LAIS|D[ÉE]SIGNATION|gris|d[eé]lai)$", re.I)
LOCALISATION_RE = re.compile(r"^Localisation\s*:", re.I)


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.replace("\u00a0", " ")).strip()


def extract_text_lines(pdf_path: Path) -> list[tuple[int, str]]:
    lines: list[tuple[int, str]] = []
    with fitz.open(pdf_path) as doc:
        for page_index, page in enumerate(doc, start=1):
            for raw in page.get_text("text").splitlines():
                line = clean_line(raw)
                if line:
                    lines.append((page_index, line))
    return lines


def is_noise(line: str) -> bool:
    return bool(
        SKIP_RE.search(line)
        or PRICE_RE.match(line)
        or QTY_RE.match(line)
        or line.lower() in {"gris", "délai", "delai"}
    )


def previous_repere(lines: list[tuple[int, str]], index: int) -> str | None:
    for _, candidate in reversed(lines[max(0, index - 6):index]):
        if REP_RE.match(candidate) and not SKIP_RE.search(candidate):
            return candidate.upper()
    return None


def next_title_index(lines: list[tuple[int, str]], start: int) -> int:
    for idx in range(start + 1, len(lines)):
        _, line = lines[idx]
        if STOP_RE.search(line):
            return idx
        if TITLE_RE.search(line):
            return idx
    return min(len(lines), start + 45)


def classify_details(detail_lines: Iterable[str]) -> dict[str, list[str]]:
    dimensions: list[str] = []
    performances: list[str] = []
    equipments: list[str] = []
    other: list[str] = []

    for line in detail_lines:
        if DIM_RE.search(line):
            dimensions.append(line)
        elif PERF_RE.search(line):
            performances.append(line)
        elif EQUIP_RE.search(line) or line.startswith("-"):
            equipments.append(line)
        else:
            other.append(line)

    return {
        "dimensions": dimensions,
        "performances": performances,
        "equipments": equipments,
        "other": other,
    }


def should_join_continuation(previous: str, line: str) -> bool:
    if not previous.startswith("-"):
        return False
    if line.startswith("-") or LOCALISATION_RE.search(line):
        return False
    if DIM_RE.search(line) or PERF_RE.search(line) or TITLE_RE.search(line) or STOP_RE.search(line):
        return False
    if line.lower().startswith("equipement fourni"):
        return False
    return True


def normalize_detail_lines(raw_lines: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    for text in raw_lines:
        if not text or is_noise(text) or STOP_RE.search(text):
            continue
        if normalized and should_join_continuation(normalized[-1], text):
            normalized[-1] = clean_line(f"{normalized[-1]} {text}")
        else:
            normalized.append(text)
        # In historical PDFs, free notes/footers after Localisation are not part of the product libelle.
        if LOCALISATION_RE.search(text):
            break
    return normalized


def build_config_text(title: str, classified: dict[str, list[str]]) -> str:
    chunks = [title]
    for key in ("dimensions", "performances", "equipments"):
        chunks.extend(classified[key])
    return " | ".join(chunks)


def extract_records(pdf_path: Path) -> list[dict]:
    lines = extract_text_lines(pdf_path)
    records: list[dict] = []

    for index, (page, line) in enumerate(lines):
        if not TITLE_RE.search(line):
            continue
        if STOP_RE.search(line):
            continue

        end = next_title_index(lines, index)
        raw_details = [text for _, text in lines[index + 1:end]]
        detail_lines = normalize_detail_lines(raw_details)
        # Strip trailing repère codes of the next product that bleed in (e.g. "P", "Po", "K1")
        while detail_lines and REP_RE.match(detail_lines[-1]) and len(detail_lines[-1]) <= 4:
            detail_lines.pop()
        classified = classify_details(detail_lines)

        # Keep only useful product/config lines. Pure shipping or footer fragments are ignored.
        useful_count = sum(len(classified[key]) for key in ("dimensions", "performances", "equipments"))
        if useful_count == 0:
            continue

        record = {
            "source_pdf": pdf_path.name,
            "page": page,
            "repere": previous_repere(lines, index),
            "title": line,
            "designation": "\n".join([line, *detail_lines[:40]]),
            "config_text": build_config_text(line, classified),
            "dimensions": classified["dimensions"],
            "performances": classified["performances"],
            "equipments": classified["equipments"],
            "other": classified["other"][:8],
        }
        records.append(record)

    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract NEXUS designation examples from quote PDFs")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_BULK_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=0, help="Limit number of PDFs for testing")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    args = parser.parse_args()

    pdfs = sorted(args.input_dir.glob("*.pdf"))
    if args.limit > 0:
        pdfs = pdfs[:args.limit]

    all_records: list[dict] = []
    errors: list[dict] = []

    for pdf in pdfs:
        try:
            all_records.extend(extract_records(pdf))
        except Exception as exc:  # keep batch extraction resilient
            errors.append({"source_pdf": pdf.name, "error": str(exc)})

    payload = {
        "source_dir": str(args.input_dir),
        "pdf_count": len(pdfs),
        "record_count": len(all_records),
        "records": all_records,
        "errors": errors,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None),
        encoding="utf-8",
    )
    print(json.dumps({"pdf_count": len(pdfs), "record_count": len(all_records), "errors": len(errors), "output": str(args.output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
