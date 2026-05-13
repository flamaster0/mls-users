from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
import re
import unicodedata

import xlrd


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = ROOT / "data" / "processed"

CITY_CANONICAL_ALIASES = [
    ("Warszawa", ["Warszawa", "Warsaw"]),
    ("Kraków", ["Krakow", "Kraków"]),
    ("Łódź", ["Lodz", "Łodz", "Łódź"]),
    ("Wrocław", ["Wroclaw", "Wrocław"]),
    ("Poznań", ["Poznan", "Poznań"]),
    ("Gdańsk", ["Gdansk", "Gdańsk"]),
    ("Szczecin", ["Szczecin"]),
    ("Bydgoszcz", ["Bydgoszcz"]),
    ("Lublin", ["Lublin"]),
    ("Białystok", ["Bialystok", "Białystok"]),
    ("Katowice", ["Katowice"]),
    ("Rzeszów", ["Rzeszow", "Rzeszów"]),
    ("Olsztyn", ["Olsztyn"]),
    ("Toruń", ["Torun", "Toruń"]),
    ("Opole", ["Opole"]),
    ("Kielce", ["Kielce"]),
    ("Zielona Góra", ["Zielona Gora", "Zielona Góra"]),
    ("Gorzów Wielkopolski", ["Gorzow Wielkopolski", "Gorzów Wielkopolski"]),
    ("Bielsko-Biała", ["Bielsko Biala", "Bielsko-Biała"]),
    ("Częstochowa", ["Czestochowa", "Częstochowa"]),
]


def clean_text(value) -> str:
    return str(value).strip() if value is not None else ""


def normalize_city_name(value) -> str:
    text = clean_text(value)
    if not text:
        return ""

    normalized = unicodedata.normalize("NFKD", text)
    without_marks = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    compact = re.sub(r"\s+", " ", without_marks).strip()

    lowered = compact.lower()
    matches = []
    for canonical, aliases in CITY_CANONICAL_ALIASES:
        for alias in aliases:
            pattern = re.compile(rf"(?<!\w){re.escape(alias.lower())}(?!\w)")
            for match in pattern.finditer(lowered):
                matches.append((match.start(), match.end() - match.start(), canonical))

    if matches:
        matches.sort(key=lambda item: (item[0], -item[1]))
        return matches[-1][2]

    return compact.title()


def to_float(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None


def to_int(value):
    num = to_float(value)
    if num is None:
        return None
    return int(round(num))


def load_sheet_rows(path: Path):
    book = xlrd.open_workbook(path.as_posix(), ignore_workbook_corruption=True)
    sh = book.sheet_by_index(0)
    header = [clean_text(x) for x in sh.row_values(0)]
    return [dict(zip(header, sh.row_values(r))) for r in range(1, sh.nrows)]


def parse_user_date(path: Path) -> str:
    match = re.search(r"(\d{4}-\d{2}-\d{2})", path.name)
    return match.group(1) if match else path.stem


def build_biura_metrics():
    biura_paths = sorted(ROOT.glob("MLS_Biura_z_dnia_*.xls"))
    if not biura_paths:
        raise FileNotFoundError("No MLS_Biura_z_dnia_*.xls files found.")
    path = biura_paths[-1]
    rows = load_sheet_rows(path)

    def field(name):
        return [r.get(name) for r in rows]

    active_offers = sum(to_int(v) or 0 for v in field("Oferty: aktywne (3)"))
    only_mls_offers = sum(to_int(v) or 0 for v in field("Oferty: only_mls (99)"))
    suspended_offers = sum(to_int(v) or 0 for v in field("Oferty: zawieszone (81)"))
    blocked_offers = sum(to_int(v) or 0 for v in field("Oferty: zablokowane (8)"))
    draft_offers = sum(to_int(v) or 0 for v in field("Oferty: robocze (52)"))
    archive_offers = sum(to_int(v) or 0 for v in field("Oferty: archiwum (7)"))
    withdrawn_offers = sum(to_int(v) or 0 for v in field("Oferty: wycofane (9)"))
    import_flags = [clean_text(v).lower() for v in field("Czy import ofert")]
    import_sources = [clean_text(v) for v in field("Źródła importu")]
    imported_agencies = sum(1 for v in import_flags if v == "tak")
    manual_agencies = sum(1 for v in import_flags if v != "tak")
    asari_agencies = sum(1 for source in import_sources if "asari" in source.lower())
    esti_agencies = sum(1 for source in import_sources if "esticrm" in source.lower())
    other_agencies = sum(
        1
        for source in import_sources
        if source and "asari" not in source.lower() and "esticrm" not in source.lower()
    )

    top = sorted(
        rows,
        key=lambda r: (to_int(r.get("Oferty: aktywne (3)")) or 0, to_int(r.get("Liczba użytkowników")) or 0),
        reverse=True,
    )[:100]
    top_agencies = [
        {
            "name": clean_text(r.get("Nazwa biura")),
            "active_offers": to_int(r.get("Oferty: aktywne (3)")) or 0,
            "users": to_int(r.get("Liczba użytkowników")) or 0,
            "branches": to_int(r.get("Liczba oddziałów")) or 0,
            "province": clean_text(r.get("Województwo siedziby")),
            "imports": clean_text(r.get("Czy import ofert")),
        }
        for r in top
    ]

    return {
        "path": path.name,
        "biura": len(rows),
        "active_offers": active_offers,
        "only_mls_offers": only_mls_offers,
        "suspended_offers": suspended_offers,
        "blocked_offers": blocked_offers,
        "draft_offers": draft_offers,
        "archive_offers": archive_offers,
        "withdrawn_offers": withdrawn_offers,
        "imported_agencies": imported_agencies,
        "manual_agencies": manual_agencies,
        "asari_agencies": asari_agencies,
        "esti_agencies": esti_agencies,
        "other_agencies": other_agencies,
        "top_agencies": top_agencies,
    }


def build_user_trends():
    region_set = set()
    city_by_region = {}
    buckets = {}

    def bucket_key(date: str, region: str, city: str) -> tuple[str, str, str]:
        return date, region, city

    def get_bucket(date: str, region: str, city: str) -> dict:
        key = bucket_key(date, region, city)
        bucket = buckets.get(key)
        if bucket is None:
            bucket = {
                "date": date,
                "region": region,
                "city": city,
                "users": 0,
                "offices_set": set(),
                "agents": 0,
                "searches": 0,
                "offers": 0,
                "only_mls": 0,
                "active": 0,
                "suspended": 0,
                "blocked": 0,
                "asari_agencies": set(),
                "esti_agencies": set(),
                "asari_offers": 0,
                "esti_offers": 0,
            }
            buckets[key] = bucket
        return bucket

    for path in sorted(ROOT.glob("MLS_Użytkownicy_z_dnia_*.xls")):
        rows = load_sheet_rows(path)
        date = parse_user_date(path)
        for row in rows:
            region = clean_text(row.get("province")).upper() or "UNKNOWN"
            city = normalize_city_name(row.get("city_name")) or "UNKNOWN"
            company = clean_text(row.get("company_name"))
            if region != "UNKNOWN":
                region_set.add(region)
                city_by_region.setdefault(region, set()).add(city)
            row_values = {
                "agents": 1,
                "searches": to_int(row.get("order_count")) or 0,
                "offers": to_int(row.get("offer_count")) or 0,
                "only_mls": to_int(row.get("only_mls")) or 0,
                "active": to_int(row.get("active")) or 0,
                "suspended": to_int(row.get("suspended")) or 0,
                "blocked": to_int(row.get("blocked")) or 0,
                "asari_imports": to_int(row.get("offer_from_Asari")) or 0,
                "esti_imports": to_int(row.get("offer_from_EstiCRM")) or 0,
            }
            bucket_targets = [
                ("ALL", "ALL"),
            ]
            if region != "UNKNOWN":
                bucket_targets.append((region, "ALL"))
            if city != "UNKNOWN":
                bucket_targets.append(("ALL", city))
            if region != "UNKNOWN" and city != "UNKNOWN":
                bucket_targets.append((region, city))

            for bucket_region, bucket_city in bucket_targets:
                bucket = get_bucket(date, bucket_region, bucket_city)
                bucket["users"] += 1
                if company:
                    bucket["offices_set"].add(company)
                bucket["agents"] += row_values["agents"]
                bucket["searches"] += row_values["searches"]
                bucket["offers"] += row_values["offers"]
                bucket["only_mls"] += row_values["only_mls"]
                bucket["active"] += row_values["active"]
                bucket["suspended"] += row_values["suspended"]
                bucket["blocked"] += row_values["blocked"]
                if row_values["asari_imports"] > 0 and company:
                    bucket["asari_agencies"].add(company)
                if row_values["esti_imports"] > 0 and company:
                    bucket["esti_agencies"].add(company)
                bucket["asari_offers"] += row_values["asari_imports"]
                bucket["esti_offers"] += row_values["esti_imports"]

    regions = sorted(region_set)
    cities = sorted({city for values in city_by_region.values() for city in values if city != "UNKNOWN"})
    region_index = {region: index for index, region in enumerate(regions)}
    city_index = {city: index for index, city in enumerate(cities)}

    trend_rows = []
    for bucket in buckets.values():
        trend_rows.append(
            [
                bucket["date"],
                region_index.get(bucket["region"], -1),
                city_index.get(bucket["city"], -1),
                bucket["users"],
                len(bucket["offices_set"]),
                bucket["agents"],
                bucket["searches"],
                bucket["offers"],
                bucket["only_mls"],
                bucket["active"],
                bucket["suspended"],
                bucket["blocked"],
                len(bucket["asari_agencies"]),
                len(bucket["esti_agencies"]),
                bucket["asari_offers"],
                bucket["esti_offers"],
            ]
        )
    trend_rows.sort(key=lambda row: (row[0], row[1], row[2]))
    return {
        "rows": trend_rows,
        "regions": regions,
        "cities": cities,
        "cities_by_region": {region: sorted(values) for region, values in city_by_region.items()},
    }


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    biura = build_biura_metrics()
    trends = build_user_trends()
    trend_rows = trends["rows"]
    region_names = trends["regions"]
    city_names = trends["cities"]

    latest_date = None
    latest_stats = {"users": 0, "offers": 0, "active": 0, "only_mls": 0}
    latest_rows = [row for row in trend_rows if row[1] == -1 and row[2] == -1]
    if latest_rows:
        latest_date = max(row[0] for row in latest_rows)
        latest_bucket = next((row for row in latest_rows if row[0] == latest_date), None)
        if latest_bucket:
            latest_stats = {
                "users": latest_bucket[3],
                "offers": latest_bucket[7],
                "active": latest_bucket[9],
                "only_mls": latest_bucket[8],
            }

    metrics = {
        "project": "MLS Users",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "biura_snapshot": biura["path"],
            "user_snapshots": sorted(
                f"MLS_Użytkownicy_z_dnia_{parse_user_date(path)}.xls"
                for path in ROOT.glob("MLS_Użytkownicy_z_dnia_*.xls")
            ),
        },
        "status": "live-skeleton",
        "note": "Pierwsze realne metryki z eksportów MLS.",
        "cards": [
            {"label": "Biura", "value": biura["biura"]},
            {"label": "Użytkownicy", "value": latest_stats["users"]},
            {"label": "Aktywne oferty", "value": biura["active_offers"]},
            {"label": "Tylko w MLS", "value": latest_stats["only_mls"]},
        ],
        "summary": {
            "latest_user_snapshot": latest_date,
            "latest_user_offers": latest_stats["offers"],
            "latest_user_active": latest_stats["active"],
            "latest_user_only_mls": latest_stats["only_mls"],
        },
        "import_breakdown": {
            "manual": biura["manual_agencies"],
            "total": biura["imported_agencies"],
            "asari": biura["asari_agencies"],
            "esti": biura["esti_agencies"],
            "other": biura["other_agencies"],
        },
        "offer_status_breakdown": {
            "active": biura["active_offers"],
            "only_mls": biura["only_mls_offers"],
            "suspended": biura["suspended_offers"],
            "blocked": biura["blocked_offers"],
            "draft": biura["draft_offers"],
            "archive": biura["archive_offers"],
            "withdrawn": biura["withdrawn_offers"],
        },
        "top_agencies": biura["top_agencies"],
        "trend_rows": trend_rows,
        "trend_dimensions": {
            "regions": trends["regions"],
            "cities": trends["cities"],
            "cities_by_region": trends["cities_by_region"],
        },
    }

    out = PROCESSED_DIR / "dashboard.json"
    out.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
