from __future__ import annotations

import argparse
import os
import secrets
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist" / "mls20"
REMOTE_PUBLIC_DIR = "/mls20"
REMOTE_AUTH_DIR = "/.htpasswd"
ZENBOX_AUTH_FILE_DIR = os.environ.get(
    "ZENBOX_AUTH_FILE_DIR",
    "../.htpasswd",
)
DEFAULT_USERNAME = "mls20"


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def generate_password(length: int = 20) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def build_bundle(username: str, password: str) -> Path:
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    copy_file(ROOT / "dashboard" / "index.html", DIST_DIR / "index.html")
    copy_file(ROOT / "dashboard" / "app.js", DIST_DIR / "app.js")
    copy_file(ROOT / "dashboard" / "styles.css", DIST_DIR / "styles.css")
    copy_file(ROOT / "data" / "processed" / "dashboard.json", DIST_DIR / "dashboard.json")

    auth_usernames = list(dict.fromkeys([username, "ftp@remonitoring.pl", "nauczylem"]))
    htpasswd_lines: list[str] = []
    for auth_username in auth_usernames:
        htpasswd_result = subprocess.run(
            ["htpasswd", "-nbm", auth_username, password],
            check=True,
            capture_output=True,
            text=True,
        )
        htpasswd_lines.append(htpasswd_result.stdout.strip())
    (DIST_DIR / ".htpasswd").write_text("\n".join(htpasswd_lines) + "\n", encoding="utf-8")
    (DIST_DIR / ".htaccess").write_text(
        "\n".join(
            [
                "AuthType Basic",
                'AuthName "MLS 20"',
                f"AuthUserFile {ZENBOX_AUTH_FILE_DIR}/mls20.htpasswd",
                "Require valid-user",
                "",
                '<FilesMatch "^(\\.htaccess|\\.htpasswd)$">',
                "  Require all denied",
                "</FilesMatch>",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    return DIST_DIR


def upload_bundle(dist_dir: Path, remote_dir: str, auth_dir: str) -> None:
    host = os.environ.get("ZENBOX_FTP_HOST", "s7.zenbox.pl")
    user = os.environ.get("ZENBOX_FTP_USER", "ftp@remonitoring.pl")
    password = os.environ.get("ZENBOX_FTP_PASSWORD")
    if not password:
        raise SystemExit("Missing ZENBOX_FTP_PASSWORD environment variable.")

    remote_dir = remote_dir.rstrip("/") or REMOTE_PUBLIC_DIR
    auth_dir = auth_dir.rstrip("/") or REMOTE_AUTH_DIR
    if remote_dir != REMOTE_PUBLIC_DIR:
        raise SystemExit("Refusing to publish outside /mls20/.")
    if auth_dir != REMOTE_AUTH_DIR:
        raise SystemExit("Refusing to publish outside the Zenbox auth directory.")

    targets = {
        "index.html": f"ftp://{host}{remote_dir}/index.html",
        "app.js": f"ftp://{host}{remote_dir}/app.js",
        "styles.css": f"ftp://{host}{remote_dir}/styles.css",
        "dashboard.json": f"ftp://{host}{remote_dir}/dashboard.json",
        ".htaccess": f"ftp://{host}{remote_dir}/.htaccess",
        ".htpasswd": f"ftp://{host}{auth_dir}/mls20.htpasswd",
    }

    for filename, remote_url in targets.items():
        local_path = dist_dir / filename
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
    parser.add_argument("--auth-dir", default=REMOTE_AUTH_DIR, help="Remote Zenbox auth directory for .htpasswd.")
    parser.add_argument("--username", default=DEFAULT_USERNAME, help="Basic Auth username. Defaults to mls20.")
    parser.add_argument("--password", help="Basic Auth password. If omitted, a secure password is generated.")
    args = parser.parse_args()

    password = args.password or generate_password()
    dist_dir = build_bundle(args.username, password)
    print(f"Built bundle in {dist_dir}")
    print(f"Basic Auth user: {args.username}")
    print("Basic Auth aliases: ftp@remonitoring.pl, nauczylem")
    print(f"Basic Auth password: {password}")

    if args.upload:
        upload_bundle(dist_dir, args.remote_dir, args.auth_dir)
        print("Uploaded bundle to Zenbox FTP.")


if __name__ == "__main__":
    main()
