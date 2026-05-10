from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist" / "mls20"


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def build_bundle() -> Path:
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    copy_file(ROOT / "dashboard" / "index.html", DIST_DIR / "index.html")
    copy_file(ROOT / "dashboard" / "app.js", DIST_DIR / "app.js")
    copy_file(ROOT / "dashboard" / "styles.css", DIST_DIR / "styles.css")
    copy_file(ROOT / "data" / "processed" / "dashboard.json", DIST_DIR / "dashboard.json")

    return DIST_DIR


def upload_bundle(dist_dir: Path, remote_dir: str) -> None:
    host = os.environ.get("ZENBOX_FTP_HOST", "s7.zenbox.pl")
    user = os.environ.get("ZENBOX_FTP_USER", "ftp@remonitoring.pl")
    password = os.environ.get("ZENBOX_FTP_PASSWORD")
    if not password:
        raise SystemExit("Missing ZENBOX_FTP_PASSWORD environment variable.")

    remote_dir = remote_dir.rstrip("/") or "/mls20"
    if remote_dir != "/mls20":
        raise SystemExit("Refusing to publish outside /mls20/.")

    for filename in ["index.html", "app.js", "styles.css", "dashboard.json"]:
        local_path = dist_dir / filename
        remote_url = f"ftp://{host}{remote_dir}/{filename}"
        subprocess.run(
            [
                "curl",
                "--ftp-create-dirs",
                "--user",
                f"{user}:{password}",
                "-T",
                str(local_path),
                remote_url,
            ],
            check=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build and optionally publish the MLS 20 bundle to Zenbox.")
    parser.add_argument("--upload", action="store_true", help="Upload the bundle to Zenbox FTP.")
    parser.add_argument("--remote-dir", default="/mls20", help="Remote FTP directory. Defaults to /mls20.")
    args = parser.parse_args()

    dist_dir = build_bundle()
    print(f"Built bundle in {dist_dir}")

    if args.upload:
        upload_bundle(dist_dir, args.remote_dir)
        print("Uploaded bundle to Zenbox FTP.")


if __name__ == "__main__":
    main()
