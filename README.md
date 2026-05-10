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
