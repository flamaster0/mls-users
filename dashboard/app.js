async function loadMetrics() {
  const candidateUrls = [
    './dashboard.json',
    '/data/processed/dashboard.json',
    '../data/processed/dashboard.json',
  ];

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // Try the next location.
    }
  }

  return null;
}

const fallbackMetrics = {
  cards: [
    { label: 'Biura', value: '--' },
    { label: 'Użytkownicy', value: '--' },
    { label: 'Aktywne oferty', value: '--' },
    { label: 'Importy', value: '--' },
  ],
  top_agencies: [],
  trend_rows: [],
  trend_dimensions: {
    regions: [],
    cities: [],
    cities_by_region: {},
  },
};

const OFFER_BREAKDOWN_START_YEAR = 2022;

const chartConfigs = [
  { key: 'offices', label: 'Liczba biur', color: '#7dd3fc', svgId: 'trend-offices-chart', latestId: 'trend-offices-latest', subtitleId: 'trend-office-subtitle', minValue: 300, maxValue: 700, yTickStep: 50 },
  { key: 'agents', label: 'Liczba agentów', color: '#f59e0b', svgId: 'trend-agents-chart', latestId: 'trend-agents-latest', subtitleId: 'trend-agents-subtitle', minValue: 0, maxValue: 5000, yTickStep: 500 },
  { key: 'searches', label: 'Poszukiwania', color: '#8b8dd9', svgId: 'trend-searches-chart', latestId: 'trend-searches-latest', subtitleId: 'trend-searches-subtitle', minValue: 1000, maxValue: 11000, yTickStep: 1000, zeroAsGap: false, hideWhenAllZero: true },
  { key: 'suspended', label: 'Oferty suspended', color: '#fb7185', svgId: 'trend-suspended-chart', latestId: 'trend-suspended-latest', subtitleId: 'trend-suspended-subtitle', minValue: 0, yTickStep: 250, zeroAsGap: true, hideWhenAllZero: true },
  { key: 'onlyMls', label: 'Tylko w MLS', color: '#60BCB2', svgId: 'trend-only-mls-chart', latestId: 'trend-only-mls-latest', subtitleId: 'trend-only-mls-subtitle', minValue: 0, yTickStep: 100, leadingGapBeforeYear: 2022 },
];

const breakdownSeriesConfig = [
  { key: 'offers', label: 'Liczba ofert', color: '#7dd3fc' },
  { key: 'onlyMlsActive', label: 'Tylko w MLS + aktywne', color: '#356B31' },
  { key: 'active', label: 'Aktywne', color: '#5D9F4F' },
];

const importOffersSeriesConfig = [
  { key: 'asariOffers', label: 'Asari', color: '#60BCB2' },
  { key: 'estiOffers', label: 'EstiCRM', color: '#5D9F4F' },
];

const state = {
  region: 'ALL',
  city: 'ALL',
  yearFrom: 'ALL',
  yearTo: 'ALL',
  topAgenciesRegion: 'ALL',
  sortKey: 'active_offers',
  sortDirection: 'desc',
  topAgenciesLimit: 10,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('pl-PL').format(value ?? 0);
}

function formatDatePl(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || '--';
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function formatMonthLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || '--';
  return new Intl.DateTimeFormat('pl-PL', { month: '2-digit' }).format(date);
}

function formatYearLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pl-PL', { year: 'numeric' }).format(date);
}

function getXAxisLabelMode(series) {
  if (!series.length) return 'monthly';
  const first = new Date(`${series[0].date}T00:00:00`);
  const last = new Date(`${series[series.length - 1].date}T00:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return 'monthly';
  const monthSpan = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth());
  if (monthSpan >= 18) return 'semiannual';
  if (monthSpan >= 9) return 'quarterly';
  return 'monthly';
}

function shouldShowXAxisLabel(dateValue, mode) {
  const month = dateValue.slice(5, 7);
  if (mode === 'semiannual') return ['01', '07'].includes(month);
  if (mode === 'quarterly') return ['01', '04', '07', '10'].includes(month);
  return true;
}

function setPageLoading(isLoading) {
  document.body.classList.toggle('is-loading', isLoading);
  document.body.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.style.display = isLoading ? 'grid' : 'none';
  }
}

function buildXAxisGuideLines(series, xForIndex, height, margin, mode) {
  if (mode === 'monthly') return '';
  const startY = margin.top;
  const endY = height - margin.bottom;
  const seen = new Set();
  const guides = [];
  const allowedMonths = mode === 'semiannual' ? new Set(['01', '07']) : new Set(['01', '04', '07', '10']);

  series.forEach((row, index) => {
    const prev = series[index - 1];
    const isFirstOfMonth = !prev || row.date.slice(0, 7) !== prev.date.slice(0, 7);
    if (!isFirstOfMonth) return;
    const month = row.date.slice(5, 7);
    const yearMonth = row.date.slice(0, 7);
    if (seen.has(yearMonth) || !allowedMonths.has(month)) return;
    seen.add(yearMonth);
    const x = xForIndex(index);
    const isJanuary = month === '01';
    guides.push(`
      <g class="chart-guide" pointer-events="none">
        <line
          x1="${x}"
          x2="${x}"
          y1="${startY}"
          y2="${endY}"
          stroke="${isJanuary ? 'rgba(125, 211, 252, 0.28)' : 'rgba(203, 213, 225, 0.18)'}"
          stroke-width="${isJanuary ? '1.8' : '1.3'}"
          stroke-dasharray="${isJanuary ? 'none' : '4 5'}"
          vector-effect="non-scaling-stroke"
        />
      </g>
    `);
  });

  return guides.join('');
}

function trimLeadingZeroSeries(series, seriesDefs) {
  const firstPositiveIndex = series.findIndex((row) =>
    seriesDefs.some((seriesDef) => (Number(row?.[seriesDef.key]) || 0) > 0),
  );

  if (firstPositiveIndex <= 0) {
    return {
      series,
      trimmed: false,
      firstPositiveDate: firstPositiveIndex >= 0 ? series[firstPositiveIndex]?.date ?? null : null,
    };
  }

  return {
    series: series.slice(firstPositiveIndex),
    trimmed: true,
    firstPositiveDate: series[firstPositiveIndex]?.date ?? null,
  };
}

function shouldAutoScaleTrend() {
  return state.region !== 'ALL' || state.city !== 'ALL' || state.yearFrom !== 'ALL' || state.yearTo !== 'ALL';
}

function getAxisBounds(values, config, step = 50) {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const autoScale = shouldAutoScaleTrend();
  const forcedMinValue = config.forceMinValue;

  if (autoScale) {
    const padding = Math.max(step / 2, 10);
    const minValue = Math.max(0, forcedMinValue != null ? forcedMinValue : 0);
    let maxValue = Math.ceil((dataMax + padding) / step) * step;
    if (maxValue <= minValue) {
      maxValue += step;
    }
    return { minValue, maxValue };
  }

  const minValue = Math.max(0, config.minValue != null ? config.minValue : Math.floor(dataMin / step) * step);
  const maxValue = config.maxValue != null ? config.maxValue : Math.ceil(dataMax / step) * step;
  return {
    minValue,
    maxValue: maxValue <= minValue ? minValue + step : maxValue,
  };
}

function getAdaptiveTickStep(values, fallbackStep = 50) {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const visibleRange = Math.max(1, dataMax - dataMin);
  if (visibleRange >= 2500 || dataMax >= 5000) return 500;
  if (visibleRange >= 600 || dataMax >= 1200) return 100;
  return 50;
}

function compareValues(a, b, key) {
  if (key === 'name') {
    return a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' });
  }

  return (Number(a[key]) || 0) - (Number(b[key]) || 0);
}

function getSortedTopAgencies(metrics) {
  const rows = Array.isArray(metrics?.top_agencies) ? [...metrics.top_agencies] : [];
  const filteredRows = state.topAgenciesRegion === 'ALL'
    ? rows
    : rows.filter((row) => row.province === state.topAgenciesRegion);
  const { sortKey, sortDirection } = state;
  const direction = sortDirection === 'asc' ? 1 : -1;

  return filteredRows.sort((a, b) => {
    const primary = compareValues(a, b, sortKey);
    if (primary !== 0) return primary * direction;
    return a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' });
  });
}

function renderCards(metrics) {
  const cards = document.querySelectorAll('.card strong');
  metrics.cards.forEach((card, index) => {
    if (cards[index]) {
      cards[index].textContent = formatNumber(card.value);
    }
  });

  const cardsDate = document.getElementById('cards-date');
  if (cardsDate) {
    cardsDate.textContent = metrics?.summary?.latest_user_snapshot
      ? formatDatePl(metrics.summary.latest_user_snapshot)
      : '--';
  }
}

function renderImportBreakdown(metrics) {
  const cards = document.querySelectorAll('#import-breakdown .card strong');
  const breakdown = metrics?.import_breakdown ?? {};
  const values = [
    breakdown.manual,
    breakdown.total,
    breakdown.asari,
    breakdown.esti,
    breakdown.other,
  ];

  values.forEach((value, index) => {
    if (cards[index]) {
      cards[index].textContent = formatNumber(value);
    }
  });
}

function renderOfferStatusChart(metrics) {
  const chart = document.getElementById('offer-status-chart');
  const summary = document.getElementById('status-summary');
  if (!chart || !summary) return;

  const breakdown = metrics?.offer_status_breakdown ?? {};
  const rows = [
    { key: 'active', label: 'Aktywne', color: '#5D9F4F' },
    { key: 'only_mls', label: 'Only MLS', color: '#60BCB2' },
    { key: 'suspended', label: 'Suspended', color: '#fb7185' },
    { key: 'archive', label: 'Archiwum', color: '#7dd3fc' },
    { key: 'withdrawn', label: 'Wycofane', color: '#94a3b8' },
    { key: 'blocked', label: 'Zablokowane', color: '#f59e0b' },
    { key: 'draft', label: 'Robocze', color: '#cbd5e1' },
  ].map((item) => ({
    ...item,
    value: Number(breakdown[item.key]) || 0,
  }));

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych o statusach ofert.</text>';
    summary.textContent = '--';
    return;
  }

  const width = 1120;
  const height = 360;
  const margin = { top: 22, right: 28, bottom: 24, left: 220 };
  const innerWidth = width - margin.left - margin.right;
  const rowHeight = 40;
  const barHeight = 20;
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  const bars = rows
    .map((row, index) => {
      const y = margin.top + index * rowHeight;
      const barWidth = (row.value / maxValue) * innerWidth;
      const share = total ? Math.round((row.value / total) * 100) : 0;
      return `
        <g>
          <text class="status-bar-label" x="${margin.left - 14}" y="${y + 14}" text-anchor="end">${escapeHtml(row.label)}</text>
          <rect x="${margin.left}" y="${y}" width="${innerWidth}" height="${barHeight}" rx="10" fill="rgba(255, 255, 255, 0.05)" />
          <rect x="${margin.left}" y="${y}" width="${barWidth}" height="${barHeight}" rx="10" fill="${row.color}" opacity="0.9" />
          <text class="status-bar-value" x="${margin.left + Math.max(barWidth + 12, 12)}" y="${y + 14}">
            ${formatNumber(row.value)} • ${share}%
          </text>
        </g>
      `;
    })
    .join('');

  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.innerHTML = bars;
  summary.textContent = `Razem statusy: ${formatNumber(total)} • archiwum: ${formatNumber(breakdown.archive)} • wycofane: ${formatNumber(breakdown.withdrawn)}`;
}

function getTrendYears(metrics) {
  const rows = Array.isArray(metrics?.trend_rows) ? metrics.trend_rows : [];
  const years = Array.from(new Set(rows.map((row) => String(row?.date ?? '').slice(0, 4)).filter((year) => /^\d{4}$/.test(year))));
  return years.sort((a, b) => Number(a) - Number(b));
}

function renderTopAgencies(metrics) {
  const tbody = document.getElementById('top-agencies');
  const meta = document.getElementById('top-agencies-meta');
  const regionSelect = document.getElementById('top-agencies-region');
  const headerButtons = document.querySelectorAll('[data-sort-key]');
  const sortLabels = {
    name: 'Agencja',
    active_offers: 'Oferty',
    users: 'Użytkownicy',
    branches: 'Oddziały',
  };

  headerButtons.forEach((button) => {
    const key = button.getAttribute('data-sort-key');
    const isActive = key === state.sortKey;
    const direction = isActive ? (state.sortDirection === 'asc' ? '▲' : '▼') : '↕';
    button.setAttribute('aria-sort', isActive ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
    button.innerHTML = `
      <span>${escapeHtml(sortLabels[key] ?? key)}</span>
      <span class="sort-indicator">${direction}</span>
    `;
  });

  if (!tbody || !Array.isArray(metrics?.top_agencies) || metrics.top_agencies.length === 0) {
    return;
  }

  if (regionSelect) {
    const regions = Array.from(new Set([
      ...(metrics.trend_dimensions?.regions ?? []),
      ...metrics.top_agencies.map((row) => row.province).filter(Boolean),
    ])).sort((a, b) => a.localeCompare(b, 'pl', { sensitivity: 'base' }));
    regionSelect.innerHTML = ['<option value="ALL">Wszystkie regiony</option>']
      .concat(regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`))
      .join('');
    if (!regions.includes(state.topAgenciesRegion)) {
      state.topAgenciesRegion = 'ALL';
    }
    regionSelect.value = state.topAgenciesRegion;
  }

  const rows = getSortedTopAgencies(metrics);
  const visibleRows = rows.slice(0, state.topAgenciesLimit);

  if (meta) {
    const snapshotDate = metrics?.summary?.latest_user_snapshot
      ? formatDatePl(metrics.summary.latest_user_snapshot)
      : '--';
    meta.innerHTML = `
      <span>Stan na ${escapeHtml(snapshotDate)}</span>
      <span>Region: ${escapeHtml(state.topAgenciesRegion === 'ALL' ? 'wszystkie' : state.topAgenciesRegion)}</span>
      <span>Pokazuję ${visibleRows.length} z ${rows.length} biur</span>
    `;
  }

  tbody.innerHTML = visibleRows
    .map(
      (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${formatNumber(row.active_offers ?? '--')}</td>
          <td>${formatNumber(row.users ?? '--')}</td>
          <td>${formatNumber(row.branches ?? '--')}</td>
        </tr>
      `,
    )
    .join('');
}

function attachTableSortHandlers(metrics) {
  document.querySelectorAll('[data-sort-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextKey = button.getAttribute('data-sort-key');
      if (!nextKey) return;

      if (state.sortKey === nextKey) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = nextKey;
        state.sortDirection = nextKey === 'name' ? 'asc' : 'desc';
      }

      renderTopAgencies(metrics);
    });
  });
}

function attachTableLimitHandler(metrics) {
  const limitSelect = document.getElementById('top-agencies-limit');
  if (!limitSelect) return;

  limitSelect.value = String(state.topAgenciesLimit);
  limitSelect.addEventListener('change', () => {
    state.topAgenciesLimit = Number(limitSelect.value) || 10;
    renderTopAgencies(metrics);
  });
}

function attachTopAgenciesRegionHandler(metrics) {
  const regionSelect = document.getElementById('top-agencies-region');
  if (!regionSelect) return;

  regionSelect.value = state.topAgenciesRegion;
  regionSelect.addEventListener('change', () => {
    state.topAgenciesRegion = regionSelect.value || 'ALL';
    renderTopAgencies(metrics);
  });
}

function getFilteredCities(metrics) {
  if (state.region === 'ALL') {
    return metrics.trend_dimensions?.cities ?? [];
  }

  return metrics.trend_dimensions?.cities_by_region?.[state.region] ?? [];
}

function getFilterLabel() {
  const regionLabel = state.region === 'ALL' ? 'wszystkie regiony' : state.region;
  const cityLabel = state.city === 'ALL' ? 'wszystkie miasta' : state.city;
  return `${regionLabel} / ${cityLabel}`;
}

function getScopeLabel() {
  if (state.city !== 'ALL') {
    return state.city.toLocaleLowerCase('pl-PL');
  }
  if (state.region !== 'ALL') {
    return state.region.toLocaleLowerCase('pl-PL');
  }
  return 'wszystkie';
}

function populateFilters(metrics) {
  const regionSelect = document.getElementById('region-filter');
  const citySelect = document.getElementById('city-filter');
  const yearFromSelect = document.getElementById('year-from-filter');
  const yearToSelect = document.getElementById('year-to-filter');
  if (!regionSelect || !citySelect || !yearFromSelect || !yearToSelect) return;

  const regions = metrics.trend_dimensions?.regions ?? [];
  const regionOptions = ['<option value="ALL">Wszystkie regiony</option>']
    .concat(regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`))
    .join('');
  regionSelect.innerHTML = regionOptions;
  regionSelect.value = state.region;

  const cities = getFilteredCities(metrics);
  const cityOptions = ['<option value="ALL">Wszystkie miasta</option>']
    .concat(cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`))
    .join('');
  citySelect.innerHTML = cityOptions;
  citySelect.value = state.city;
  citySelect.disabled = cities.length === 0;

  const years = getTrendYears(metrics);
  const yearOptions = years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`).join('');
  yearFromSelect.innerHTML = yearOptions;
  yearToSelect.innerHTML = yearOptions;

  if (years.length > 0) {
    if (!years.includes(state.yearFrom)) state.yearFrom = years[0];
    if (!years.includes(state.yearTo)) state.yearTo = years[years.length - 1];
  }

  yearFromSelect.value = state.yearFrom;
  yearToSelect.value = state.yearTo;
}

function buildTrendSeries(metrics) {
  const rows = Array.isArray(metrics?.trend_rows) ? metrics.trend_rows : [];
  const regionNames = Array.isArray(metrics?.trend_dimensions?.regions) ? metrics.trend_dimensions.regions : [];
  const cityNames = Array.isArray(metrics?.trend_dimensions?.cities) ? metrics.trend_dimensions.cities : [];

  const decodeTrendRow = (row) => {
    if (!Array.isArray(row)) return row;
    const [date, regionIndex, cityIndex, users, offices, agents, searches, offers, onlyMls, active, suspended, blocked, asariAgencies, estiAgencies, asariOffers, estiOffers] = row;
    return {
      date,
      region: regionIndex >= 0 ? regionNames[regionIndex] ?? 'UNKNOWN' : 'ALL',
      city: cityIndex >= 0 ? cityNames[cityIndex] ?? 'UNKNOWN' : 'ALL',
      users,
      offices,
      agents,
      searches,
      offers,
      only_mls: onlyMls,
      active,
      suspended,
      blocked,
      asari_agencies: asariAgencies,
      esti_agencies: estiAgencies,
      asari_offers: asariOffers,
      esti_offers: estiOffers,
    };
  };

  const selectedRegion = state.region;
  const selectedCity = state.city;
  const targetRegion = selectedRegion === 'ALL' ? 'ALL' : selectedRegion;
  const targetCity = selectedCity === 'ALL' ? 'ALL' : selectedCity;
  const filteredRows = rows.filter((row) => {
    const decoded = decodeTrendRow(row);
    if (decoded.region !== targetRegion) return false;
    if (decoded.city !== targetCity) return false;
    const year = String(decoded?.date ?? '').slice(0, 4);
    if (state.yearFrom !== 'ALL' && year < state.yearFrom) return false;
    if (state.yearTo !== 'ALL' && year > state.yearTo) return false;
    return decoded;
  }).map(decodeTrendRow);

  const grouped = new Map();
  for (const row of filteredRows.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const key = `${row.date}|${row.region}|${row.city}`;
    const bucket = grouped.get(key) ?? {
      date: row.date,
      offices: 0,
      agents: 0,
      searches: 0,
      offers: 0,
      onlyMls: 0,
      active: 0,
      suspended: 0,
      asariAgencies: 0,
      estiAgencies: 0,
      asariOffers: 0,
      estiOffers: 0,
    };

    bucket.offices += Number(row.offices) || 0;
    bucket.agents += Number(row.agents) || 0;
    bucket.searches += Number(row.searches) || 0;
    bucket.offers += Number(row.offers) || 0;
    bucket.onlyMls += Number(row.only_mls) || 0;
    bucket.active += Number(row.active) || 0;
    bucket.suspended += Number(row.suspended) || 0;
    bucket.asariAgencies += Number(row.asari_agencies) || 0;
    bucket.estiAgencies += Number(row.esti_agencies) || 0;
    bucket.asariOffers += Number(row.asari_offers) || 0;
    bucket.estiOffers += Number(row.esti_offers) || 0;
    grouped.set(key, bucket);
  }

  return Array.from(grouped.values()).map((row) => ({
    date: row.date,
    offices: row.offices,
    agents: row.agents,
    searches: row.searches,
    offers: row.offers,
    onlyMls: row.onlyMls,
    active: row.active,
    suspended: row.suspended,
    onlyMlsActive: row.onlyMls + row.active,
    asariAgencies: row.asariAgencies,
    estiAgencies: row.estiAgencies,
    asariOffers: row.asariOffers,
    estiOffers: row.estiOffers,
  }));
}

function aggregateSeriesByMonth(series, keys) {
  const grouped = new Map();
  for (const row of series) {
    const monthKey = String(row.date).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;

    const bucket = grouped.get(monthKey) ?? {
      date: `${monthKey}-01`,
      ...Object.fromEntries(keys.map((key) => [key, 0])),
    };

    for (const key of keys) {
      bucket[key] = Number(row[key]) || 0;
    }

    grouped.set(monthKey, bucket);
  }

  return Array.from(grouped.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function pathFromPoints(points, options = {}) {
  const { allowGaps = false } = options;
  const filteredPoints = allowGaps ? points.filter(Boolean) : points.filter(Boolean);
  if (!allowGaps) {
    if (!filteredPoints.length) return '';
    if (filteredPoints.length < 2) {
      return filteredPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    }

    const tension = 0.18;
    const path = [`M ${filteredPoints[0].x.toFixed(2)} ${filteredPoints[0].y.toFixed(2)}`];

    for (let index = 0; index < filteredPoints.length - 1; index += 1) {
      const current = filteredPoints[index];
      const next = filteredPoints[index + 1];
      const prev = filteredPoints[index - 1] ?? current;
      const nextNext = filteredPoints[index + 2] ?? next;

      const cp1x = current.x + (next.x - prev.x) * tension;
      const cp1y = current.y + (next.y - prev.y) * tension;
      const cp2x = next.x - (nextNext.x - current.x) * tension;
      const cp2y = next.y - (nextNext.y - current.y) * tension;

      path.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`);
    }

    return path.join(' ');
  }

  const segments = [];
  let currentSegment = [];
  for (const point of points) {
    if (!point) {
      if (currentSegment.length) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }
    currentSegment.push(point);
  }
  if (currentSegment.length) segments.push(currentSegment);

  return segments
    .map((segment) => pathFromPoints(segment, { allowGaps: false }))
    .filter(Boolean)
    .join(' ');
}

function ensureChartTooltip(chart) {
  const shell = chart.parentElement;
  if (!shell) return null;

  let tooltip = shell.querySelector('.chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    shell.appendChild(tooltip);
  }

  return tooltip;
}

function ensureChartLegend(chart) {
  const shell = chart.parentElement;
  if (!shell) return null;

  let legend = shell.nextElementSibling;
  if (!legend || !legend.classList.contains('chart-legend')) {
    legend = document.createElement('div');
    legend.className = 'chart-legend';
    shell.insertAdjacentElement('afterend', legend);
  }

  return legend;
}

function ensureHoverLayer(chart, lineCount) {
  let layer = chart.querySelector('.chart-hover-layer');
  if (!layer) {
    layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('class', 'chart-hover-layer');
    chart.appendChild(layer);
  }

  while (layer.childNodes.length < lineCount) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'chart-hover-line');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-width', '1.4');
    line.setAttribute('stroke-dasharray', '6 6');
    line.setAttribute('opacity', '0');
    line.setAttribute('pointer-events', 'none');
    layer.appendChild(line);
  }

  while (layer.childNodes.length > lineCount) {
    layer.removeChild(layer.lastChild);
  }

  return Array.from(layer.querySelectorAll('.chart-hover-line'));
}

function setChartTooltip(chart, series, config, seriesDefs, width, height, margin) {
  const tooltip = ensureChartTooltip(chart);
  if (!tooltip || !series.length) return;

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xForIndex = (index) => margin.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const maxValues = seriesDefs.map((seriesDef) => Math.max(1, ...series.map((row) => Number(row[seriesDef.key]) || 0)));

  const pointsBySeries = seriesDefs.map((seriesDef, seriesIndex) =>
    series.map((row, index) => {
      const value = Number(row[seriesDef.key]) || 0;
      const isGap = Boolean(config.zeroAsGap && value === 0) || Boolean(config.gapBeforeYear && Number(String(row.date).slice(0, 4)) < config.gapBeforeYear && seriesDef.key !== 'offers');
      const yForValue = (rawValue) => margin.top + innerHeight - ((rawValue - 0) / (maxValues[seriesIndex] - 0)) * innerHeight;
      return {
        x: xForIndex(index),
        y: isGap ? null : yForValue(value),
        value: isGap ? null : value,
      };
    }),
  );
  const hoverLines = ensureHoverLayer(chart, seriesDefs.length);

  const updateTooltip = (event) => {
    const rect = chart.getBoundingClientRect();
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    const x = event.clientX - rect.left;
    const svgX = x / scaleX;
    const rawIndex = series.length === 1
      ? 0
      : Math.round(((svgX - margin.left) / innerWidth) * (series.length - 1));
    const index = Math.max(0, Math.min(series.length - 1, rawIndex));
    const row = series[index];
    const tooltipRows = seriesDefs
      .map((seriesDef, seriesIndex) => {
        const point = pointsBySeries[seriesIndex][index];
        return `
          <div class="chart-tooltip-row">
            <span class="chart-tooltip-swatch" style="background:${seriesDef.color}"></span>
            <span class="chart-tooltip-label">${escapeHtml(seriesDef.label)}:</span>
            <strong>${point.value == null ? '—' : formatNumber(point.value)}</strong>
          </div>
        `;
      })
      .join('');

    hoverLines.forEach((line, seriesIndex) => {
      const point = pointsBySeries[seriesIndex][index];
      if (!point || point.y == null) {
        line.setAttribute('opacity', '0');
        return;
      }
      line.setAttribute('x1', margin.left);
      line.setAttribute('x2', width - margin.right);
      line.setAttribute('y1', point.y);
      line.setAttribute('y2', point.y);
      line.setAttribute('stroke', seriesDefs[seriesIndex].color);
      line.setAttribute('opacity', '0.45');
    });

    tooltip.innerHTML = `
      <div class="chart-tooltip-date">${escapeHtml(row.date)}</div>
      ${tooltipRows}
    `;

    const point = pointsBySeries[0][index];
    const tooltipWidth = 220;
    const tooltipHeight = 42 + seriesDefs.length * 28;
    let left = point.x * scaleX + 16;
    let top = (point.y ?? margin.top) * scaleY - 16;
    const maxLeft = rect.width - tooltipWidth - 8;
    const maxTop = rect.height - tooltipHeight - 8;

    if (left > maxLeft) left = point.x * scaleX - tooltipWidth - 16;
    if (left < 8) left = 8;
    if (top > maxTop) top = maxTop;
    if (top < 8) top = 8;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.opacity = '1';
  };

  chart.style.cursor = 'crosshair';
  chart.onpointermove = updateTooltip;
  chart.onpointerenter = updateTooltip;
  chart.onpointerleave = () => {
    tooltip.style.opacity = '0';
    hoverLines.forEach((line) => {
      line.setAttribute('opacity', '0');
    });
  };
}

function renderSingleChart(series, config) {
  const chart = document.getElementById(config.svgId);
  const latestBox = document.getElementById(config.latestId);
  const subtitle = document.getElementById(config.subtitleId);
  if (!chart || !latestBox || !subtitle) return;
  const legend = ensureChartLegend(chart);

  if (series.length === 0) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    latestBox.textContent = '--';
    subtitle.textContent = 'Snapshoty tygodniowe';
    if (legend) {
      legend.innerHTML = `
        <span class="chart-legend-item">
          <span class="chart-legend-swatch" style="background:${config.color}"></span>
          <span>${escapeHtml(config.label)}</span>
        </span>
      `;
    }
    return;
  }

  const width = 1120;
  const height = 280;
  const margin = { top: 18, right: 22, bottom: 48, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const dataMaxValue = Math.max(1, ...series.map((row) => row[config.key] ?? 0));
  const values = [...series.map((row) => row[config.key] ?? 0), dataMaxValue];
  const bounds = getAxisBounds(values, config, config.yTickStep ?? 50);
  const minValue = bounds.minValue;
  const maxValue = bounds.maxValue;
  const xForIndex = (index) => margin.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const range = Math.max(1, maxValue - minValue);
  const yForValue = (value) => margin.top + innerHeight - ((value - minValue) / range) * innerHeight;

  const grid = [];
  const tickStep = config.yTickStep != null
    ? (shouldAutoScaleTrend() ? getAdaptiveTickStep(values, config.yTickStep) : config.yTickStep)
    : getAdaptiveTickStep(values, 50);
  if (tickStep) {
    const start = Math.ceil(maxValue / tickStep) * tickStep;
    for (let value = start; value >= minValue; value -= tickStep) {
      const ratio = (value - minValue) / range;
      const y = margin.top + innerHeight - ratio * innerHeight;
      grid.push(`
        <g>
          <line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="rgba(148, 163, 184, 0.14)" />
          <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="#9fb0c7" font-size="12">${formatNumber(value)}</text>
        </g>
      `);
    }
  } else {
    const gridLines = 4;
    Array.from({ length: gridLines + 1 }, (_, index) => {
      const ratio = index / gridLines;
      const value = Math.round(minValue + ((maxValue - minValue) * (1 - ratio)));
      const y = margin.top + ratio * innerHeight;
      grid.push(`
        <g>
          <line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="rgba(148, 163, 184, 0.14)" />
          <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="#9fb0c7" font-size="12">${formatNumber(value)}</text>
        </g>
      `);
      return null;
    });
  }

  const xAxisMode = getXAxisLabelMode(series);
  const xLabels = series.map((row, index) => {
    const prev = series[index - 1];
    const isFirstOfMonth = !prev || row.date.slice(0, 7) !== prev.date.slice(0, 7);
    if (!isFirstOfMonth || !shouldShowXAxisLabel(row.date, xAxisMode)) return '';
    const x = xForIndex(index);
    const isFirstOfYear = row.date.slice(5, 7) === '01';
    const monthLabel = escapeHtml(formatMonthLabel(row.date));
    const yearLabel = isFirstOfYear ? escapeHtml(formatYearLabel(row.date)) : '';
    return `
      <text x="${x}" y="${height - 16}" text-anchor="middle" fill="#9fb0c7" font-size="12">
        <tspan x="${x}" dy="0">${monthLabel}</tspan>
        ${isFirstOfYear ? `<tspan x="${x}" dy="14" font-size="10" fill="#7f93ab">${yearLabel}</tspan>` : ''}
      </text>
    `;
  });
  const points = series.map((row, index) => {
    const value = Number(row[config.key]) || 0;
    if (config.leadingGapBeforeYear && Number(String(row.date).slice(0, 4)) < config.leadingGapBeforeYear) return null;
    if (config.zeroAsGap && value === 0) return null;
    return { x: xForIndex(index), y: yForValue(value), value };
  });
  const path = pathFromPoints(points, { allowGaps: Boolean(config.zeroAsGap) });
  const last = [...points].reverse().find((point) => point);
  if (!path) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    latestBox.textContent = '--';
    subtitle.textContent = `${config.label} - ${getScopeLabel()} • brak danych`;
    if (legend) {
      legend.innerHTML = `
        <span class="chart-legend-item">
          <span class="chart-legend-swatch" style="background:${config.color}"></span>
          <span>${escapeHtml(config.label)}</span>
        </span>
      `;
    }
    return;
  }

  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.innerHTML = `
    ${grid.join('')}
    <path d="${path}" fill="none" stroke="${config.color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
    ${last ? `<circle cx="${last.x}" cy="${last.y}" r="4.5" fill="${config.color}" stroke="rgba(7, 17, 31, 0.9)" stroke-width="2" />` : ''}
    ${buildXAxisGuideLines(series, xForIndex, height, margin, xAxisMode)}
    ${xLabels.join('')}
    <g class="chart-hover-layer">
      <line class="chart-hover-line" x1="${margin.left}" x2="${width - margin.right}" y1="${last.y}" y2="${last.y}" stroke="${config.color}" stroke-linecap="round" stroke-width="1.4" stroke-dasharray="6 6" opacity="0" pointer-events="none" />
    </g>
  `;

  setChartTooltip(chart, series, config, [config], width, height, margin);
  subtitle.textContent = `${config.label} - ${getScopeLabel()} • ${series.length} snapshotów`;
  latestBox.textContent = formatNumber(series[series.length - 1][config.key]);
  if (legend) {
    legend.innerHTML = `
      <span class="chart-legend-item">
        <span class="chart-legend-swatch" style="background:${config.color}"></span>
        <span>${escapeHtml(config.label)}</span>
      </span>
    `;
  }
}

function renderMultiSeriesChart(series, config) {
  const chart = document.getElementById(config.svgId);
  const latestBox = document.getElementById(config.latestId);
  const subtitle = document.getElementById(config.subtitleId);
  if (!chart || !latestBox || !subtitle) return;
  const legend = ensureChartLegend(chart);
  const leadingTrim = config.trimLeadingZeros ? trimLeadingZeroSeries(series, config.seriesDefs) : { series, trimmed: false, firstPositiveDate: null };
  const displaySeries = leadingTrim.series;

  const hasPositiveValues = series.some((row) =>
    config.seriesDefs.some((seriesDef) => (Number(row[seriesDef.key]) || 0) > 0),
  );

  if (series.length === 0) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    latestBox.innerHTML = '';
    subtitle.textContent = 'Snapshoty tygodniowe';
    if (legend) {
      legend.innerHTML = config.seriesDefs
        .map((seriesDef) => `
          <span class="chart-legend-item">
            <span class="chart-legend-swatch" style="background:${seriesDef.color}"></span>
            <span>${escapeHtml(seriesDef.label)}</span>
          </span>
        `)
        .join('');
    }
    return;
  }

  if (config.hideWhenAllZero && !hasPositiveValues) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla wybranego filtra.</text>';
    latestBox.innerHTML = '';
    subtitle.textContent = `${config.label} - ${getScopeLabel()} • brak danych`;
    if (legend) {
      legend.innerHTML = config.seriesDefs
        .map((seriesDef) => `
          <span class="chart-legend-item">
            <span class="chart-legend-swatch" style="background:${seriesDef.color}"></span>
            <span>${escapeHtml(seriesDef.label)}</span>
          </span>
        `)
        .join('');
    }
    return;
  }

  if (!displaySeries.length) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla wybranego filtra.</text>';
    latestBox.innerHTML = '';
    subtitle.textContent = `${config.label} - ${getScopeLabel()} • brak danych`;
    if (legend) {
      legend.innerHTML = config.seriesDefs
        .map((seriesDef) => `
          <span class="chart-legend-item">
            <span class="chart-legend-swatch" style="background:${seriesDef.color}"></span>
            <span>${escapeHtml(seriesDef.label)}</span>
          </span>
        `)
        .join('');
    }
    return;
  }

  const width = 1120;
  const height = 280;
  const margin = { top: 18, right: 22, bottom: 48, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const values = displaySeries.flatMap((row) => config.seriesDefs.map((seriesDef) => row[seriesDef.key] ?? 0));
  const bounds = getAxisBounds(values, { minValue: config.minValue, maxValue: config.maxValue }, config.yTickStep ?? 50);
  const minValue = bounds.minValue;
  const maxValue = bounds.maxValue;
  const xForIndex = (index) => margin.left + (displaySeries.length === 1 ? innerWidth / 2 : (index / (displaySeries.length - 1)) * innerWidth);
  const range = Math.max(1, maxValue - minValue);
  const yForValue = (value) => margin.top + innerHeight - ((value - minValue) / range) * innerHeight;

  const grid = [];
  const gridStep = shouldAutoScaleTrend()
    ? getAdaptiveTickStep(values, config.gridStep ?? config.yTickStep ?? 500)
    : (config.gridStep ?? config.yTickStep ?? 500);
  const start = Math.ceil(maxValue / gridStep) * gridStep;
  for (let value = start; value >= minValue; value -= gridStep) {
    const ratio = (value - minValue) / range;
    const y = margin.top + innerHeight - ratio * innerHeight;
    grid.push(`
      <g>
        <line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="rgba(148, 163, 184, 0.14)" />
        <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="#9fb0c7" font-size="12">${formatNumber(value)}</text>
      </g>
    `);
  }

  const xAxisMode = getXAxisLabelMode(displaySeries);
  const xLabels = displaySeries.map((row, index) => {
    const prev = displaySeries[index - 1];
    const isFirstOfMonth = !prev || row.date.slice(0, 7) !== prev.date.slice(0, 7);
    if (!isFirstOfMonth || !shouldShowXAxisLabel(row.date, xAxisMode)) return '';
    const x = xForIndex(index);
    const isFirstOfYear = row.date.slice(5, 7) === '01';
    const monthLabel = escapeHtml(formatMonthLabel(row.date));
    const yearLabel = isFirstOfYear ? escapeHtml(formatYearLabel(row.date)) : '';
    return `
      <text x="${x}" y="${height - 16}" text-anchor="middle" fill="#9fb0c7" font-size="12">
        <tspan x="${x}" dy="0">${monthLabel}</tspan>
        ${isFirstOfYear ? `<tspan x="${x}" dy="14" font-size="10" fill="#7f93ab">${yearLabel}</tspan>` : ''}
      </text>
    `;
  });
  const linesMarkup = config.seriesDefs
    .map((seriesDef) => {
      const points = displaySeries.map((row, index) => {
        const value = Number(row[seriesDef.key]) || 0;
        if (config.zeroAsGap && value === 0) return null;
        return { x: xForIndex(index), y: yForValue(value), value };
      });
      const last = [...points].reverse().find((point) => point);
      const path = pathFromPoints(points, { allowGaps: Boolean(config.zeroAsGap) });
      if (!path) return '';
      return `
        <path d="${path}" fill="none" stroke="${seriesDef.color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
        ${last ? `<circle cx="${last.x}" cy="${last.y}" r="4.5" fill="${seriesDef.color}" stroke="rgba(7, 17, 31, 0.9)" stroke-width="2" />` : ''}
      `;
    })
    .join('');

  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.innerHTML = `
    ${grid.join('')}
    ${linesMarkup}
    ${buildXAxisGuideLines(displaySeries, xForIndex, height, margin, xAxisMode)}
    ${xLabels.join('')}
    <g class="chart-hover-layer"></g>
  `;

  setChartTooltip(chart, displaySeries, { label: config.tooltipLabel ?? config.label ?? 'Wartość' }, config.seriesDefs, width, height, margin);
  subtitle.textContent = `${config.label} - ${getScopeLabel()} • ${displaySeries.length} snapshotów${leadingTrim.trimmed && leadingTrim.firstPositiveDate ? ` • od ${formatDatePl(leadingTrim.firstPositiveDate)}` : ''}`;
  latestBox.innerHTML = config.latestRenderer(displaySeries[displaySeries.length - 1], displaySeries);
  if (legend) {
    legend.innerHTML = config.seriesDefs
      .map((seriesDef) => `
        <span class="chart-legend-item">
          <span class="chart-legend-swatch" style="background:${seriesDef.color}"></span>
          <span>${escapeHtml(seriesDef.label)}</span>
        </span>
      `)
      .join('');
  }
}

function renderTrendCharts(metrics) {
  const title = document.getElementById('trend-title');
  const subtitle = document.getElementById('trend-subtitle');
  if (!title || !subtitle) return;

  const series = buildTrendSeries(metrics);
  title.textContent = 'Trend';
  subtitle.textContent = series.length
    ? `${series.length} snapshotów • lata ${state.yearFrom === 'ALL' ? 'wszystkie' : state.yearFrom}-${state.yearTo === 'ALL' ? 'wszystkie' : state.yearTo}`
    : 'Snapshoty tygodniowe';

  for (const config of chartConfigs) {
    renderSingleChart(series, config);
  }

  const breakdownChart = document.getElementById('trend-offers-breakdown-chart');
  const breakdownLatest = document.getElementById('trend-offers-breakdown-latest');
  const breakdownSubtitle = document.getElementById('trend-offers-breakdown-subtitle');
  const breakdownNote = document.getElementById('trend-offers-breakdown-note');
  const searchesChart = document.getElementById('trend-searches-chart');
  const searchesLatest = document.getElementById('trend-searches-latest');
  const searchesSubtitle = document.getElementById('trend-searches-subtitle');
  const onlyMlsChart = document.getElementById('trend-only-mls-chart');
  const onlyMlsLatest = document.getElementById('trend-only-mls-latest');
  const onlyMlsSubtitle = document.getElementById('trend-only-mls-subtitle');
  const importSourcesChart = document.getElementById('trend-import-sources-chart');
  const importSourcesLatest = document.getElementById('trend-import-sources-latest');
  const importSourcesSubtitle = document.getElementById('trend-import-sources-subtitle');
  const importOffersChart = document.getElementById('trend-import-offers-chart');
  const importOffersLatest = document.getElementById('trend-import-offers-latest');
  const importOffersSubtitle = document.getElementById('trend-import-offers-subtitle');
  const suspendedChart = document.getElementById('trend-suspended-chart');
  const suspendedLatest = document.getElementById('trend-suspended-latest');
  const suspendedSubtitle = document.getElementById('trend-suspended-subtitle');
  if (!breakdownChart || !breakdownLatest || !breakdownSubtitle || !breakdownNote || !searchesChart || !searchesLatest || !searchesSubtitle || !onlyMlsChart || !onlyMlsLatest || !onlyMlsSubtitle || !importSourcesChart || !importSourcesLatest || !importSourcesSubtitle || !importOffersChart || !importOffersLatest || !importOffersSubtitle || !suspendedChart || !suspendedLatest || !suspendedSubtitle) return;

  if (series.length === 0) {
    breakdownChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    breakdownLatest.innerHTML = '';
    breakdownSubtitle.textContent = `Liczba ofert - ${getScopeLabel()} • brak danych`;
    breakdownNote.textContent = 'Brak danych dla tego filtra.';
    searchesChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    searchesLatest.textContent = '--';
    searchesSubtitle.textContent = `Poszukiwania - ${getScopeLabel()} • brak danych`;
    onlyMlsChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    onlyMlsLatest.textContent = '--';
    onlyMlsSubtitle.textContent = `Tylko w MLS - ${getScopeLabel()} • brak danych`;
    importSourcesChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    importSourcesLatest.innerHTML = '';
    importSourcesSubtitle.textContent = `Agencje z importem Asari / EstiCRM - ${getScopeLabel()} • brak danych`;
    importOffersChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    importOffersLatest.innerHTML = '';
    importOffersSubtitle.textContent = `Oferty dodane przez Asari / EstiCRM - ${getScopeLabel()} • brak danych`;
    suspendedChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    suspendedLatest.textContent = '--';
    suspendedSubtitle.textContent = `Oferty suspended - ${getScopeLabel()} • brak danych`;
    return;
  }

  const width = 1120;
  const height = 280;
  const margin = { top: 18, right: 22, bottom: 48, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const breakdownSeries = series.map((row) => {
    const year = Number(String(row.date).slice(0, 4));
    const breakdownVisible = year >= OFFER_BREAKDOWN_START_YEAR;
    return {
      ...row,
      onlyMlsActive: breakdownVisible ? row.onlyMls + row.active : null,
      active: breakdownVisible ? row.active : null,
    };
  });
  const values = breakdownSeries.flatMap((row) => breakdownSeriesConfig.map((config) => Number(row[config.key]) || 0));
  const bounds = getAxisBounds(values, { minValue: 0 }, 100);
  const minValue = bounds.minValue;
  const maxValue = bounds.maxValue;
  const xForIndex = (index) => margin.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const range = Math.max(1, maxValue - minValue);
  const yForValue = (value) => margin.top + innerHeight - ((value - minValue) / range) * innerHeight;

  const grid = [];
  const breakdownStep = shouldAutoScaleTrend() ? getAdaptiveTickStep(values, 500) : 1000;
  for (let value = Math.ceil(maxValue / breakdownStep) * breakdownStep; value >= minValue; value -= breakdownStep) {
    const ratio = (value - minValue) / range;
    const y = margin.top + innerHeight - ratio * innerHeight;
    grid.push(`
      <g>
        <line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="rgba(148, 163, 184, 0.14)" />
        <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="#9fb0c7" font-size="12">${formatNumber(value)}</text>
      </g>
    `);
  }

  const xAxisMode = getXAxisLabelMode(series);
  const xLabels = series.map((row, index) => {
    const prev = series[index - 1];
    const isFirstOfMonth = !prev || row.date.slice(0, 7) !== prev.date.slice(0, 7);
    if (!isFirstOfMonth || !shouldShowXAxisLabel(row.date, xAxisMode)) return '';
    const x = xForIndex(index);
    const isFirstOfYear = row.date.slice(5, 7) === '01';
    const monthLabel = escapeHtml(formatMonthLabel(row.date));
    const yearLabel = isFirstOfYear ? escapeHtml(formatYearLabel(row.date)) : '';
    return `
      <text x="${x}" y="${height - 16}" text-anchor="middle" fill="#9fb0c7" font-size="12">
        <tspan x="${x}" dy="0">${monthLabel}</tspan>
        ${isFirstOfYear ? `<tspan x="${x}" dy="14" font-size="10" fill="#7f93ab">${yearLabel}</tspan>` : ''}
      </text>
    `;
  });

  const seriesMarkup = breakdownSeriesConfig
    .map((config) => {
      const points = breakdownSeries.map((row, index) => {
        const value = Number(row[config.key]);
        if (config.key !== 'offers' && Number(String(row.date).slice(0, 4)) < OFFER_BREAKDOWN_START_YEAR) return null;
        return { x: xForIndex(index), y: yForValue(value ?? 0), value };
      });
      const path = pathFromPoints(points, { allowGaps: true });
      if (!path) return '';
      const last = [...points].reverse().find((point) => point);
      return `
        <path d="${path}" fill="none" stroke="${config.color}" stroke-width="${config.key === 'offers' ? '3.4' : '3.2'}" stroke-linecap="round" stroke-linejoin="round" />
        ${last ? `<circle cx="${last.x}" cy="${last.y}" r="4.5" fill="${config.color}" stroke="rgba(7, 17, 31, 0.9)" stroke-width="2" />` : ''}
      `;
    })
    .join('');

  breakdownChart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  breakdownChart.innerHTML = `
    ${grid.join('')}
    ${seriesMarkup}
    ${buildXAxisGuideLines(series, xForIndex, height, margin, xAxisMode)}
    ${xLabels.join('')}
  `;
  setChartTooltip(breakdownChart, breakdownSeries, { label: 'Liczba ofert', gapBeforeYear: OFFER_BREAKDOWN_START_YEAR }, breakdownSeriesConfig, width, height, margin);
  breakdownSubtitle.textContent = `Liczba ofert - ${getScopeLabel()} • ${series.length} snapshotów`;
  breakdownNote.textContent = `Rozbicie pokazujemy od ${OFFER_BREAKDOWN_START_YEAR}; wcześniejsze lata mają tylko łączną liczbę ofert.`;
  breakdownLatest.innerHTML = `
    <div class="trend-breakdown-latest-grid">
      ${breakdownSeriesConfig
        .map(
          (config) => `
            <div class="trend-latest-card">
              <span>${config.label}</span>
              <strong>${formatNumber(breakdownSeries[breakdownSeries.length - 1][config.key] ?? series[series.length - 1][config.key])}</strong>
            </div>
          `,
        )
        .join('')}
    </div>
  `;

  renderSingleChart(
    series,
    {
      key: 'searches',
      label: 'Poszukiwania',
      color: '#8b8dd9',
      svgId: 'trend-searches-chart',
      latestId: 'trend-searches-latest',
      subtitleId: 'trend-searches-subtitle',
      minValue: 1000,
      maxValue: 11000,
      yTickStep: 1000,
    },
  );

  renderSingleChart(
    series,
    {
      key: 'onlyMls',
      label: 'Tylko w MLS',
      color: '#60BCB2',
      svgId: 'trend-only-mls-chart',
      latestId: 'trend-only-mls-latest',
      subtitleId: 'trend-only-mls-subtitle',
      minValue: 400,
      maxValue: 1000,
      yTickStep: 100,
    },
  );

  renderMultiSeriesChart(
    series,
    {
      label: 'Agencje z importem Asari / EstiCRM',
      svgId: 'trend-import-sources-chart',
      latestId: 'trend-import-sources-latest',
      subtitleId: 'trend-import-sources-subtitle',
      seriesDefs: [
        { key: 'asariAgencies', label: 'Asari', color: '#60BCB2' },
        { key: 'estiAgencies', label: 'EstiCRM', color: '#5D9F4F' },
      ],
      tooltipLabel: 'Agencje',
      minValue: 0,
      yTickStep: 25,
      gridStep: 25,
      hideWhenAllZero: true,
      zeroAsGap: false,
      latestRenderer: (latest) => `
        <div class="trend-breakdown-latest-grid">
          <div class="trend-latest-card">
            <span>Asari</span>
            <strong>${formatNumber(latest.asariAgencies)}</strong>
          </div>
          <div class="trend-latest-card">
            <span>EstiCRM</span>
            <strong>${formatNumber(latest.estiAgencies)}</strong>
          </div>
        </div>
      `,
    },
  );

  renderMultiSeriesChart(
    aggregateSeriesByMonth(series, ['asariOffers', 'estiOffers']),
    {
      label: 'Oferty dodane przez Asari / EstiCRM',
      svgId: 'trend-import-offers-chart',
      latestId: 'trend-import-offers-latest',
      subtitleId: 'trend-import-offers-subtitle',
      seriesDefs: importOffersSeriesConfig,
      tooltipLabel: 'Oferty',
      minValue: 0,
      yTickStep: 2000,
      gridStep: 2000,
      hideWhenAllZero: true,
      zeroAsGap: false,
      trimLeadingZeros: false,
      latestRenderer: (latest) => `
        <div class="trend-breakdown-latest-grid">
          <div class="trend-latest-card">
            <span>Asari</span>
            <strong>${formatNumber(latest.asariOffers)}</strong>
          </div>
          <div class="trend-latest-card">
            <span>EstiCRM</span>
            <strong>${formatNumber(latest.estiOffers)}</strong>
          </div>
        </div>
      `,
    },
  );

  searchesSubtitle.textContent = `Poszukiwania - ${getScopeLabel()} • ${series.length} snapshotów`;
  onlyMlsSubtitle.textContent = `Tylko w MLS - ${getScopeLabel()} • ${series.length} snapshotów`;
  importSourcesSubtitle.textContent = `Agencje z importem Asari / EstiCRM - ${getScopeLabel()} • ${series.length} snapshotów`;
}

function attachFilterHandlers(metrics) {
  const regionSelect = document.getElementById('region-filter');
  const citySelect = document.getElementById('city-filter');
  const yearFromSelect = document.getElementById('year-from-filter');
  const yearToSelect = document.getElementById('year-to-filter');
  if (!regionSelect || !citySelect || !yearFromSelect || !yearToSelect) return;

  regionSelect.addEventListener('change', () => {
    state.region = regionSelect.value;
    state.city = 'ALL';
    populateFilters(metrics);
    renderTrendCharts(metrics);
  });

  citySelect.addEventListener('change', () => {
    state.city = citySelect.value;
    renderTrendCharts(metrics);
  });

  yearFromSelect.addEventListener('change', () => {
    state.yearFrom = yearFromSelect.value;
    if (state.yearTo !== 'ALL' && state.yearFrom !== 'ALL' && Number(state.yearFrom) > Number(state.yearTo)) {
      state.yearTo = state.yearFrom;
    }
    populateFilters(metrics);
    renderTrendCharts(metrics);
  });

  yearToSelect.addEventListener('change', () => {
    state.yearTo = yearToSelect.value;
    if (state.yearFrom !== 'ALL' && state.yearTo !== 'ALL' && Number(state.yearTo) < Number(state.yearFrom)) {
      state.yearFrom = state.yearTo;
    }
    populateFilters(metrics);
    renderTrendCharts(metrics);
  });
}

setPageLoading(false);
const metrics = (await loadMetrics()) ?? fallbackMetrics;

try {
  renderCards(metrics);
  renderImportBreakdown(metrics);
  renderOfferStatusChart(metrics);
  renderTopAgencies(metrics);
  attachTableSortHandlers(metrics);
  attachTableLimitHandler(metrics);
  attachTopAgenciesRegionHandler(metrics);
  populateFilters(metrics);
  attachFilterHandlers(metrics);
  renderTrendCharts(metrics);
} catch (error) {
  console.error('Dashboard render failed', error);
}
