# MLS Users

Prywatny projekt do analizy eksportów MLS z plików `.xls`.

## Co tu jest

- `MLS_Biura_z_dnia_2026-05-10.xls` - snapshot biur
- `MLS_Użytkownicy_z_dnia_*.xls` - tygodniowe snapshoty użytkowników i aktywności
- `scripts/` - pipeline do wczytywania i budowania metryk
- `data/raw/` - surowe pliki wejściowe
- `data/processed/` - JSON/CSV dla dashboardu
- `dashboard/` - statyczny panel raportowy

## Start

Na tym etapie szkielet jest gotowy do rozbudowy:

1. wrzuć nowe pliki do `data/raw/`
2. uruchom import i budowę metryk
3. odpal dashboard lokalnie i podglądaj wyniki

## Najbliższy plan

- parser `.xls`
- normalizacja nazw biur i użytkowników
- metryki tygodniowe
- dashboard z rankingami i trendami

## Start online za hasłem

Jeśli chcesz wystawić dashboard publicznie, ale z hasłem, użyj wbudowanego serwera Basic Auth:

```bash
export MLS_DASHBOARD_USER="twoj_login"
export MLS_DASHBOARD_PASSWORD="twoje_haslo"
python3 scripts/serve_private.py --port 8080
```

Po uruchomieniu dashboard będzie dostępny na porcie `8080`, a przeglądarka poprosi o login i hasło.

## Co dalej do prawdziwego hostingu

- ustaw domenę lub subdomenę
- wystaw ten serwer za reverse proxy lub tunelem HTTPS
- trzymaj login i hasło poza repo, jako zmienne środowiskowe
- jeśli chcesz, mogę też przygotować wariant pod Docker albo pod konkretny hosting z panelem logowania

## Publikacja `mls20`

Nowy moduł można publikować do osobnego katalogu:

- `https://remonitoring.pl/mls20/`
- `https://remonitoring.pl/mls20/index.html`
- `https://remonitoring.pl/mls20/dashboard.json`

Bundle buduje się tak:

```bash
python3 scripts/publish_mls20.py
```

Jeśli chcesz od razu wysłać pliki na Zenbox, ustaw zmienne środowiskowe:

```bash
export ZENBOX_FTP_HOST="s7.zenbox.pl"
export ZENBOX_FTP_USER="ftp@remonitoring.pl"
export ZENBOX_FTP_PASSWORD="twoje_haslo_ftp"
python3 scripts/publish_mls20.py --upload
```

Skrypt publikuje wyłącznie do `/mls20/` i nie dotyka roota domeny.
