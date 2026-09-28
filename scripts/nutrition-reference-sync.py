#!/usr/bin/env python3
"""Download and normalize official CIQUAL 2025 and UK CoFID 2021 reference foods.

Standard-library only: no pandas/openpyxl dependency is required. The output is
newline-delimited JSON that the Diewish backend imports into the staging
nutrition cache.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any, Iterable

USER_AGENT = "Diewish-Nutrition-Reference-Sync/1.0"
CIQUAL_RECORD_API = "https://zenodo.org/api/records/17550133"
CIQUAL_FILE_NAME = "Table Ciqual 2025_ENG_2025_11_03.xlsx"
CIQUAL_SOURCE_PAGE = "https://zenodo.org/records/17550133"
COFID_SOURCE_PAGE = "https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid"
COFID_FILE_HINT = "McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021"
XML_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

NUTRIENT_KEYS = (
    "energyKcal",
    "proteinG",
    "carbohydratesG",
    "fatG",
    "saturatedFatG",
    "sugarsG",
    "fiberG",
    "sodiumMg",
    "saltG",
)

MICRONUTRIENTS: dict[str, tuple[str, tuple[str, ...]]] = {
    "calcium": ("mg", ("calcium",)),
    "iron": ("mg", ("iron",)),
    "magnesium": ("mg", ("magnesium",)),
    "phosphorus": ("mg", ("phosphorus", "phosphore")),
    "potassium": ("mg", ("potassium",)),
    "zinc": ("mg", ("zinc",)),
    "copper": ("mg", ("copper",)),
    "manganese": ("mg", ("manganese",)),
    "selenium": ("ug", ("selenium",)),
    "iodine": ("ug", ("iodine",)),
    "vitaminA": ("ug", ("vitamin a", "retinol activity", "retinol equivalent")),
    "vitaminC": ("mg", ("vitamin c", "ascorbic acid")),
    "vitaminD": ("ug", ("vitamin d",)),
    "vitaminE": ("mg", ("vitamin e", "alpha tocopherol")),
    "vitaminK": ("ug", ("vitamin k", "phylloquinone")),
    "thiamin": ("mg", ("thiamin", "vitamin b1")),
    "riboflavin": ("mg", ("riboflavin", "vitamin b2")),
    "niacin": ("mg", ("niacin", "vitamin b3", "vitamin pp")),
    "vitaminB6": ("mg", ("vitamin b6",)),
    "folate": ("ug", ("folate", "folic acid", "vitamin b9")),
    "vitaminB12": ("ug", ("vitamin b12",)),
}


def http_bytes(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def http_json(url: str) -> dict[str, Any]:
    return json.loads(http_bytes(url).decode("utf-8"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def discover_ciqual_url() -> str:
    record = http_json(CIQUAL_RECORD_API)
    for file_info in record.get("files", []):
        if file_info.get("key") != CIQUAL_FILE_NAME:
            continue
        links = file_info.get("links") or {}
        url = links.get("content") or links.get("self")
        if isinstance(url, str) and url.startswith("https://"):
            return url
    raise RuntimeError(f"CIQUAL file not found in official Zenodo record: {CIQUAL_FILE_NAME}")


def discover_cofid_url() -> str:
    page = http_bytes(COFID_SOURCE_PAGE).decode("utf-8", errors="replace")
    candidates = re.findall(r'href=["\']([^"\']+\.xlsx(?:\?[^"\']*)?)["\']', page, flags=re.I)
    decoded = [html.unescape(urllib.parse.urljoin(COFID_SOURCE_PAGE, value)) for value in candidates]
    for url in decoded:
        if COFID_FILE_HINT.lower() in url.lower():
            return url
    raise RuntimeError("Official CoFID 2021 XLSX link was not found on GOV.UK")


def column_index(cell_reference: str) -> int:
    letters = "".join(ch for ch in cell_reference if ch.isalpha()).upper()
    value = 0
    for ch in letters:
        value = value * 26 + (ord(ch) - ord("A") + 1)
    return max(value - 1, 0)


def shared_strings(book: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in book.namelist():
        return []
    root = ET.fromstring(book.read("xl/sharedStrings.xml"))
    result: list[str] = []
    for si in root.findall(f"{{{XML_MAIN}}}si"):
        text_parts = [node.text or "" for node in si.iter(f"{{{XML_MAIN}}}t")]
        result.append("".join(text_parts))
    return result


def sheet_rows(book: zipfile.ZipFile, path: str, strings: list[str]) -> list[list[str]]:
    root = ET.fromstring(book.read(path))
    rows: list[list[str]] = []
    for row in root.iter(f"{{{XML_MAIN}}}row"):
        values: dict[int, str] = {}
        max_col = -1
        for cell in row.findall(f"{{{XML_MAIN}}}c"):
            reference = cell.attrib.get("r", "A1")
            col = column_index(reference)
            max_col = max(max_col, col)
            cell_type = cell.attrib.get("t")
            raw_value = cell.find(f"{{{XML_MAIN}}}v")
            value = ""
            if cell_type == "inlineStr":
                inline = cell.find(f"{{{XML_MAIN}}}is")
                if inline is not None:
                    value = "".join(node.text or "" for node in inline.iter(f"{{{XML_MAIN}}}t"))
            elif raw_value is not None and raw_value.text is not None:
                raw = raw_value.text
                if cell_type == "s":
                    try:
                        value = strings[int(raw)]
                    except (ValueError, IndexError):
                        value = raw
                else:
                    value = raw
            values[col] = value.strip()
        if max_col >= 0:
            rows.append([values.get(index, "") for index in range(max_col + 1)])
    return rows


def normalize_text(value: str) -> str:
    value = value.replace("\xa0", " ").replace("_", " ")
    value = value.casefold()
    value = value.replace("é", "e").replace("è", "e").replace("ê", "e")
    value = value.replace("à", "a").replace("â", "a").replace("î", "i")
    value = value.replace("ô", "o").replace("ù", "u").replace("û", "u")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def header_score(row: list[str]) -> int:
    combined = " ".join(normalize_text(value) for value in row if value)
    signals = (
        "food",
        "alim",
        "name",
        "nom",
        "code",
        "energy",
        "energie",
        "kcal",
        "protein",
        "proteine",
        "carbo",
        "glucide",
        "fat",
        "lipid",
        "sodium",
        "sugar",
        "sucre",
        "fiber",
        "fibre",
    )
    return sum(1 for signal in signals if signal in combined)


def choose_table(data: bytes) -> tuple[list[str], list[list[str]], str]:
    with zipfile.ZipFile(Path(os.devnull) if False else __import__("io").BytesIO(data)) as book:
        strings = shared_strings(book)
        sheet_paths = sorted(
            path
            for path in book.namelist()
            if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", path)
        )
        best: tuple[int, int, list[str], list[list[str]], str] | None = None
        for path in sheet_paths:
            rows = sheet_rows(book, path, strings)
            if not rows:
                continue
            candidate_indexes = range(min(30, len(rows)))
            header_index = max(candidate_indexes, key=lambda idx: header_score(rows[idx]))
            score = header_score(rows[header_index])
            data_rows = rows[header_index + 1 :]
            nonempty_rows = sum(1 for row in data_rows if any(value.strip() for value in row))
            candidate = (score, nonempty_rows, rows[header_index], data_rows, path)
            if best is None or candidate[:2] > best[:2]:
                best = candidate
        if best is None or best[0] < 5:
            raise RuntimeError("Could not locate a nutrition table in XLSX")
        return best[2], best[3], best[4]


def find_column(
    headers: list[str],
    required_any: tuple[str, ...],
    required_all: tuple[str, ...] = (),
    excluded: tuple[str, ...] = (),
) -> int | None:
    normalized = [normalize_text(header) for header in headers]
    for index, header in enumerate(normalized):
        if not header:
            continue
        if required_any and not any(token in header for token in required_any):
            continue
        if required_all and not all(token in header for token in required_all):
            continue
        if excluded and any(token in header for token in excluded):
            continue
        return index
    return None


def first_column(headers: list[str], specs: Iterable[tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]]) -> int | None:
    for required_any, required_all, excluded in specs:
        index = find_column(headers, required_any, required_all, excluded)
        if index is not None:
            return index
    return None


def parse_number(value: str) -> float | None:
    raw = value.strip().replace("\xa0", " ")
    if not raw:
        return None
    lowered = raw.casefold()
    if lowered in {"-", "n", "nd", "na", "n/a", "trace", "traces", "tr"}:
        return None
    if lowered.startswith("<") or lowered.startswith(">"):
        return None
    cleaned = raw.replace(" ", "").replace(",", ".")
    cleaned = re.sub(r"[^0-9eE+\-.]", "", cleaned)
    if not cleaned:
        return None
    try:
        number = float(cleaned)
    except ValueError:
        return None
    if not (number >= 0) or number == float("inf"):
        return None
    return round(number, 6)


def get(row: list[str], index: int | None) -> str:
    if index is None or index >= len(row):
        return ""
    return row[index].strip()


def build_column_map(headers: list[str]) -> dict[str, int | None]:
    code = first_column(
        headers,
        (
            (("alim code",), (), ()),
            (("food code",), (), ()),
            (("code",), (), ("group", "component", "infoods")),
        ),
    )
    name = first_column(
        headers,
        (
            (("alim nom eng",), (), ()),
            (("food name",), (), ()),
            (("food",), ("name",), ("group", "subgroup")),
            (("name",), (), ("group", "component")),
        ),
    )
    energy = first_column(
        headers,
        (
            (("energy", "energie"), ("kcal",), ()),
            (("kcal",), (), ()),
        ),
    )
    protein = first_column(headers, ((("protein", "proteine"), (), ()),))
    carbohydrates = first_column(
        headers,
        (
            (("carbohydrate", "glucide"), (), ("sugar", "sucre")),
            (("carb",), (), ("sugar",)),
        ),
    )
    saturated = first_column(
        headers,
        (
            (("saturated fat", "saturated fatty", "satd fat", "ag satures"), (), ()),
            (("satur",), ("fat",), ()),
        ),
    )
    fat = first_column(
        headers,
        (
            (("total fat", "lipid", "lipide"), (), ("satur", "mono", "poly", "trans")),
            (("fat",), (), ("satur", "mono", "poly", "trans", "fatty acid")),
        ),
    )
    sugars = first_column(
        headers,
        (
            (("total sugars", "sugars", "sucres"), (), ("added",)),
        ),
    )
    fiber = first_column(
        headers,
        (
            (("aoac fibre", "aoac fiber", "dietary fibre", "dietary fiber", "fibres alimentaires"), (), ()),
            (("fibre", "fiber"), (), ()),
        ),
    )
    sodium = first_column(headers, ((("sodium",), (), ()),))
    salt = first_column(
        headers,
        (
            (("salt", "sel chlorure", "nacl"), (), ("sodium",)),
        ),
    )
    return {
        "code": code,
        "name": name,
        "energyKcal": energy,
        "proteinG": protein,
        "carbohydratesG": carbohydrates,
        "fatG": fat,
        "saturatedFatG": saturated,
        "sugarsG": sugars,
        "fiberG": fiber,
        "sodiumMg": sodium,
        "saltG": salt,
    }


def micronutrient_columns(headers: list[str]) -> dict[str, int | None]:
    normalized = [normalize_text(header) for header in headers]
    result: dict[str, int | None] = {}
    for key, (_, aliases) in MICRONUTRIENTS.items():
        result[key] = next(
            (
                index
                for index, header in enumerate(normalized)
                if any(alias in header for alias in aliases)
            ),
            None,
        )
    return result


def header_unit(header: str) -> str | None:
    raw = header.casefold().replace("μ", "µ")
    if "µg" in raw or "mcg" in raw or "microgram" in raw or re.search(r"(^|[^a-z])ug([^a-z]|$)", raw):
        return "ug"
    if "mg" in raw or "milligram" in raw:
        return "mg"
    if "gram" in raw or re.search(r"(^|[^a-z])g(?:/|\s|\)|$)", raw):
        return "g"
    return None


def convert_unit(value: float | None, source: str | None, target: str) -> float | None:
    if value is None or source is None:
        return None
    micrograms = value * 1_000_000 if source == "g" else value * 1_000 if source == "mg" else value
    converted = micrograms / 1_000 if target == "mg" else micrograms
    return round(converted, 6)


def stable_external_id(provider: str, code: str, name: str) -> str:
    cleaned = code.strip()
    if cleaned:
        return cleaned[:120]
    digest = hashlib.sha256(f"{provider}:{name}".encode("utf-8")).hexdigest()[:24]
    return f"name-{digest}"


def normalize_dataset(
    provider: str,
    data: bytes,
    source_reference: str,
    source_version: str,
    provider_updated_at: str,
    confidence: float,
) -> list[dict[str, Any]]:
    headers, rows, sheet = choose_table(data)
    columns = build_column_map(headers)
    micro_columns = micronutrient_columns(headers)
    if columns["name"] is None or columns["energyKcal"] is None:
        raise RuntimeError(
            f"{provider}: required name/energy columns were not detected; sheet={sheet}; headers={headers[:20]}"
        )

    retrieved_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in rows:
        name = get(row, columns["name"])
        if len(name) < 2:
            continue
        code = get(row, columns["code"])
        external_id = stable_external_id(provider, code, name)
        if external_id in seen:
            continue

        nutrients: dict[str, Any] = {}
        for key in NUTRIENT_KEYS:
            nutrients[key] = parse_number(get(row, columns[key]))

        micronutrients: dict[str, float | None] = {}
        for key, (target_unit, _) in MICRONUTRIENTS.items():
            column = micro_columns[key]
            raw = parse_number(get(row, column))
            source_unit = header_unit(headers[column]) if column is not None else None
            micronutrients[key] = convert_unit(raw, source_unit, target_unit)
        if any(value is not None for value in micronutrients.values()):
            nutrients["micronutrients"] = micronutrients

        core_count = sum(
            nutrients[key] is not None
            for key in ("proteinG", "carbohydratesG", "fatG")
        )
        if nutrients["energyKcal"] is None or core_count < 2:
            continue

        food = {
            "externalId": external_id,
            "provider": provider,
            "name": name[:240],
            "displayNameTr": name[:240],
            "brand": None,
            "barcode": None,
            "imageUrl": None,
            "quantity": None,
            "serving": None,
            "nutrientsPer100g": nutrients,
            "ingredients": [],
            "allergens": [],
            "additives": [],
            "labels": ["reference-food", source_version],
            "vegan": None,
            "vegetarian": None,
            "glutenFree": None,
            "nutriScore": None,
            "novaGroup": None,
            "provenance": {
                "provider": provider,
                "externalId": external_id,
                "retrievedAt": retrieved_at,
                "dataBasis": "PER_100_G",
                "confidence": confidence,
                "sourceReference": source_reference,
                "providerUpdatedAt": provider_updated_at,
                "stale": False,
            },
        }
        seen.add(external_id)
        result.append(food)

    return result


def write_ndjson(path: Path, foods: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for food in foods:
            handle.write(json.dumps(food, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--minimum-ciqual", type=int, default=3000)
    parser.add_argument("--minimum-cofid", type=int, default=2000)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    ciqual_url = discover_ciqual_url()
    cofid_url = discover_cofid_url()
    ciqual_bytes = http_bytes(ciqual_url, timeout=120)
    cofid_bytes = http_bytes(cofid_url, timeout=120)

    ciqual = normalize_dataset(
        "CIQUAL",
        ciqual_bytes,
        "Anses. 2025. Ciqual French food composition table 2025. https://doi.org/10.5281/zenodo.17550133",
        "ciqual-2025",
        "2025-11-19T00:00:00Z",
        0.96,
    )
    cofid = normalize_dataset(
        "COFID",
        cofid_bytes,
        "UK Composition of Foods Integrated Dataset (CoFID), 2021. GOV.UK",
        "cofid-2021",
        "2021-03-19T00:00:00Z",
        0.95,
    )

    if len(ciqual) < args.minimum_ciqual:
        raise RuntimeError(f"CIQUAL normalized only {len(ciqual)} foods; refusing incomplete sync")
    if len(cofid) < args.minimum_cofid:
        raise RuntimeError(f"CoFID normalized only {len(cofid)} foods; refusing incomplete sync")

    write_ndjson(output_dir / "ciqual.ndjson", ciqual)
    write_ndjson(output_dir / "cofid.ndjson", cofid)
    summary = {
        "ciqual": {
            "count": len(ciqual),
            "sha256": sha256_bytes(ciqual_bytes),
            "source": CIQUAL_SOURCE_PAGE,
            "download": ciqual_url,
        },
        "cofid": {
            "count": len(cofid),
            "sha256": sha256_bytes(cofid_bytes),
            "source": COFID_SOURCE_PAGE,
            "download": cofid_url,
        },
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"nutrition-reference-sync failed: {exc}", file=sys.stderr)
        raise
