from __future__ import annotations

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
SOURCE_PATTERNS = ("*.xls", "*.xlsx")


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0

    for pattern in SOURCE_PATTERNS:
      for src in ROOT.glob(pattern):
            if src.is_file():
                dst = RAW_DIR / src.name
                if dst.resolve() == src.resolve():
                    continue
                shutil.copy2(src, dst)
                copied += 1

    print(f"Copied {copied} source files into {RAW_DIR}")


if __name__ == "__main__":
    main()
