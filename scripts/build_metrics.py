from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime


ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = ROOT / "data" / "processed"


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    metrics = {
        "project": "MLS Users",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "sources": {
            "biura_snapshot": "MLS_Biura_z_dnia_2026-05-10.xls",
            "user_snapshots": sorted(
                p.name for p in ROOT.glob("MLS_Użytkownicy_z_dnia_*.xls")
            ),
        },
        "status": "skeleton",
        "note": "This file will be replaced by real aggregations from the XLS exports.",
        "cards": [
            {"label": "Biura", "value": None},
            {"label": "Użytkownicy", "value": None},
            {"label": "Aktywne oferty", "value": None},
            {"label": "Importy", "value": None},
        ],
        "top_agencies": [],
        "trends": [],
    }

    out = PROCESSED_DIR / "dashboard.json"
    out.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
