async function loadMetrics() {
  try {
    const response = await fetch('/data/processed/dashboard.json', { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
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

const chartConfigs = [
  { key: 'offices', label: 'Liczba biur', color: '#7dd3fc', svgId: 'trend-offices-chart', latestId: 'trend-offices-latest', subtitleId: 'trend-office-subtitle', minValue: 400, maxValue: 700, yTickStep: 50 },
  { key: 'agents', label: 'Liczba agentów', color: '#f59e0b', svgId: 'trend-agents-chart', latestId: 'trend-agents-latest', subtitleId: 'trend-agents-subtitle', minValue: 3000, maxValue: 5000, yTickStep: 100 },
  { key: 'searches', label: 'Poszukiwania', color: '#8b8dd9', svgId: 'trend-searches-chart', latestId: 'trend-searches-latest', subtitleId: 'trend-searches-subtitle' },
];

const breakdownSeriesConfig = [
  { key: 'onlyMlsActive', label: 'Tylko w MLS + aktywne', color: '#356B31' },
  { key: 'active', label: 'Aktywne', color: '#5D9F4F' },
];

const state = {
  region: 'ALL',
  city: 'ALL',
  yearFrom: 'ALL',
  yearTo: 'ALL',
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

function shouldAutoScaleTrend() {
  return state.region !== 'ALL' || state.city !== 'ALL' || state.yearFrom !== 'ALL' || state.yearTo !== 'ALL';
}

function getAxisBounds(values, config, step = 50) {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const autoScale = shouldAutoScaleTrend();

  if (autoScale) {
    let minValue = Math.floor((dataMin - step) / step) * step;
    let maxValue = Math.ceil((dataMax + step) / step) * step;
    if (maxValue <= minValue) {
      minValue -= step;
      maxValue += step;
    }
    return { minValue, maxValue };
  }

  const minValue = config.minValue != null ? config.minValue : Math.floor(dataMin / step) * step;
  const maxValue = config.maxValue != null ? config.maxValue : Math.ceil(dataMax / step) * step;
  return {
    minValue,
    maxValue: maxValue <= minValue ? minValue + step : maxValue,
  };
}

function compareValues(a, b, key) {
  if (key === 'name') {
    return a.name.localeCompare(b.name, 'pl', { sensitivity: 'base' });
  }

  return (Number(a[key]) || 0) - (Number(b[key]) || 0);
}

function getSortedTopAgencies(metrics) {
  const rows = Array.isArray(metrics?.top_agencies) ? [...metrics.top_agencies] : [];
  const { sortKey, sortDirection } = state;
  const direction = sortDirection === 'asc' ? 1 : -1;

  return rows.sort((a, b) => {
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

function getTrendYears(metrics) {
  const rows = Array.isArray(metrics?.trend_rows) ? metrics.trend_rows : [];
  const years = Array.from(new Set(rows.map((row) => String(row?.date ?? '').slice(0, 4)).filter((year) => /^\d{4}$/.test(year))));
  return years.sort((a, b) => Number(a) - Number(b));
}

function renderTopAgencies(metrics) {
  const tbody = document.getElementById('top-agencies');
  const meta = document.getElementById('top-agencies-meta');
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

  const rows = getSortedTopAgencies(metrics);
  const visibleRows = rows.slice(0, state.topAgenciesLimit);

  if (meta) {
    const snapshotDate = metrics?.summary?.latest_user_snapshot
      ? formatDatePl(metrics.summary.latest_user_snapshot)
      : '--';
    meta.innerHTML = `
      <span>Stan na ${escapeHtml(snapshotDate)}</span>
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

function getFilteredCities(metrics) {
  if (state.region === 'ALL') {
    return metrics.trend_dimensions?.cities ?? [];
  }

  return metrics.trend_dimensions?.cities_by_region?.[state.region] ?? [];
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
  const filteredRows = rows.filter((row) => {
    if (state.region !== 'ALL' && row.region !== state.region) return false;
    if (state.city !== 'ALL' && row.city !== state.city) return false;
    const year = String(row?.date ?? '').slice(0, 4);
    if (state.yearFrom !== 'ALL' && year < state.yearFrom) return false;
    if (state.yearTo !== 'ALL' && year > state.yearTo) return false;
    return true;
  });

  const grouped = new Map();
  for (const row of filteredRows) {
    const bucket = grouped.get(row.date) ?? {
      date: row.date,
      officesSet: new Set(),
      agents: 0,
      searches: 0,
      offers: 0,
      onlyMls: 0,
      active: 0,
    };
    if (row.company) bucket.officesSet.add(row.company);
    bucket.agents += Number(row.agents) || 0;
    bucket.searches += Number(row.searches) || 0;
    bucket.offers += Number(row.offers) || 0;
    bucket.onlyMls += Number(row.only_mls) || 0;
    bucket.active += Number(row.active) || 0;
    grouped.set(row.date, bucket);
  }

  return Array.from(grouped.values())
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((row) => ({
      date: row.date,
      offices: row.officesSet.size,
      agents: row.agents,
      searches: row.searches,
      offers: row.offers,
      onlyMls: row.onlyMls,
      active: row.active,
      onlyMlsActive: row.onlyMls + row.active,
    }));
}

function pathFromPoints(points) {
  if (!points.length) return '';
  if (points.length < 2) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  }

  const tension = 0.18;
  const path = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const prev = points[index - 1] ?? current;
    const nextNext = points[index + 2] ?? next;

    const cp1x = current.x + (next.x - prev.x) * tension;
    const cp1y = current.y + (next.y - prev.y) * tension;
    const cp2x = next.x - (nextNext.x - current.x) * tension;
    const cp2y = next.y - (nextNext.y - current.y) * tension;

    path.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`);
  }

  return path.join(' ');
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
      const yForValue = (value) => margin.top + innerHeight - ((value - 0) / (maxValues[seriesIndex] - 0)) * innerHeight;
      return {
        x: xForIndex(index),
        y: yForValue(row[seriesDef.key] ?? 0),
        value: row[seriesDef.key] ?? 0,
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
            <strong>${formatNumber(point.value)}</strong>
          </div>
        `;
      })
      .join('');

    hoverLines.forEach((line, seriesIndex) => {
      const point = pointsBySeries[seriesIndex][index];
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
    let top = point.y * scaleY - 16;
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

  if (series.length === 0) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    latestBox.textContent = '--';
    subtitle.textContent = 'Snapshoty tygodniowe';
    return;
  }

  const width = 1120;
  const height = 280;
  const margin = { top: 18, right: 22, bottom: 48, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const dataMaxValue = Math.max(1, ...series.map((row) => row[config.key] ?? 0));
  const bounds = getAxisBounds([...(series.map((row) => row[config.key] ?? 0)), dataMaxValue], config, config.yTickStep ?? 50);
  const minValue = bounds.minValue;
  const maxValue = bounds.maxValue;
  const xForIndex = (index) => margin.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const range = Math.max(1, maxValue - minValue);
  const yForValue = (value) => margin.top + innerHeight - ((value - minValue) / range) * innerHeight;

  const grid = [];
  const tickStep = config.yTickStep ?? null;
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

  const xLabels = series.map((row, index) => {
    const prev = series[index - 1];
    const isFirstOfMonth = !prev || row.date.slice(0, 7) !== prev.date.slice(0, 7);
    if (!isFirstOfMonth) return '';
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

  const points = series.map((row, index) => ({ x: xForIndex(index), y: yForValue(row[config.key] ?? 0) }));
  const path = pathFromPoints(points);
  const last = points[points.length - 1];

  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.innerHTML = `
    ${grid.join('')}
    <path d="${path}" fill="none" stroke="${config.color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${last.x}" cy="${last.y}" r="4.5" fill="${config.color}" stroke="rgba(7, 17, 31, 0.9)" stroke-width="2" />
    ${xLabels.join('')}
    <g class="chart-hover-layer">
      <line class="chart-hover-line" x1="${margin.left}" x2="${width - margin.right}" y1="${last.y}" y2="${last.y}" stroke="${config.color}" stroke-linecap="round" stroke-width="1.4" stroke-dasharray="6 6" opacity="0" pointer-events="none" />
    </g>
  `;

  setChartTooltip(chart, series, config, [config], width, height, margin);
  subtitle.textContent = `${series.length} snapshotów`;
  latestBox.textContent = formatNumber(series[series.length - 1][config.key]);
}

function renderMultiSeriesChart(series, config) {
  const chart = document.getElementById(config.svgId);
  const latestBox = document.getElementById(config.latestId);
  const subtitle = document.getElementById(config.subtitleId);
  if (!chart || !latestBox || !subtitle) return;

  if (series.length === 0) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    latestBox.innerHTML = '';
    subtitle.textContent = 'Snapshoty tygodniowe';
    return;
  }

  const width = 1120;
  const height = 280;
  const margin = { top: 18, right: 22, bottom: 48, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const values = series.flatMap((row) => config.seriesDefs.map((seriesDef) => row[seriesDef.key] ?? 0));
  const bounds = getAxisBounds(values, { minValue: config.minValue, maxValue: config.maxValue }, config.yTickStep ?? 50);
  const minValue = bounds.minValue;
  const maxValue = bounds.maxValue;
  const xForIndex = (index) => margin.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const range = Math.max(1, maxValue - minValue);
  const yForValue = (value) => margin.top + innerHeight - ((value - minValue) / range) * innerHeight;

  const grid = [];
  const gridStep = config.gridStep ?? config.yTickStep ?? 500;
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

  const xLabels = series.map((row, index) => {
    const prev = series[index - 1];
    const isFirstOfMonth = !prev || row.date.slice(0, 7) !== prev.date.slice(0, 7);
    if (!isFirstOfMonth) return '';
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
      const points = series.map((row, index) => ({ x: xForIndex(index), y: yForValue(row[seriesDef.key] ?? 0) }));
      const last = points[points.length - 1];
      return `
        <path d="${pathFromPoints(points)}" fill="none" stroke="${seriesDef.color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${last.x}" cy="${last.y}" r="4.5" fill="${seriesDef.color}" stroke="rgba(7, 17, 31, 0.9)" stroke-width="2" />
      `;
    })
    .join('');

  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.innerHTML = `
    ${grid.join('')}
    ${linesMarkup}
    ${xLabels.join('')}
    <g class="chart-hover-layer"></g>
  `;

  setChartTooltip(chart, series, { label: config.tooltipLabel ?? config.label ?? 'Wartość' }, config.seriesDefs, width, height, margin);
  subtitle.textContent = `${series.length} snapshotów`;
  latestBox.innerHTML = config.latestRenderer(series[series.length - 1], series);
}

function renderTrendCharts(metrics) {
  const title = document.getElementById('trend-title');
  const subtitle = document.getElementById('trend-subtitle');
  if (!title || !subtitle) return;

  const series = buildTrendSeries(metrics);
  title.textContent = `Trend: ${state.region === 'ALL' ? 'Wszystkie regiony' : state.region}${state.city === 'ALL' ? '' : ` / ${state.city}`}`;
  subtitle.textContent = series.length
    ? `${series.length} snapshotów • lata ${state.yearFrom === 'ALL' ? 'wszystkie' : state.yearFrom}-${state.yearTo === 'ALL' ? 'wszystkie' : state.yearTo}`
    : 'Snapshoty tygodniowe';

  for (const config of chartConfigs) {
    renderSingleChart(series, config);
  }

  const breakdownChart = document.getElementById('trend-offers-breakdown-chart');
  const breakdownLatest = document.getElementById('trend-offers-breakdown-latest');
  const breakdownSubtitle = document.getElementById('trend-offers-breakdown-subtitle');
  const searchesChart = document.getElementById('trend-searches-chart');
  const searchesLatest = document.getElementById('trend-searches-latest');
  const searchesSubtitle = document.getElementById('trend-searches-subtitle');
  const onlyMlsChart = document.getElementById('trend-only-mls-chart');
  const onlyMlsLatest = document.getElementById('trend-only-mls-latest');
  const onlyMlsSubtitle = document.getElementById('trend-only-mls-subtitle');
  const importSourcesChart = document.getElementById('trend-import-sources-chart');
  const importSourcesLatest = document.getElementById('trend-import-sources-latest');
  const importSourcesSubtitle = document.getElementById('trend-import-sources-subtitle');
  if (!breakdownChart || !breakdownLatest || !breakdownSubtitle || !searchesChart || !searchesLatest || !searchesSubtitle || !onlyMlsChart || !onlyMlsLatest || !onlyMlsSubtitle || !importSourcesChart || !importSourcesLatest || !importSourcesSubtitle) return;

  if (series.length === 0) {
    breakdownChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    breakdownLatest.innerHTML = '';
    breakdownSubtitle.textContent = 'Tylko w MLS + aktywne / aktywne';
    searchesChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    searchesLatest.textContent = '--';
    searchesSubtitle.textContent = 'Snapshoty tygodniowe';
    onlyMlsChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    onlyMlsLatest.textContent = '--';
    onlyMlsSubtitle.textContent = 'Snapshoty tygodniowe';
    importSourcesChart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    importSourcesLatest.innerHTML = '';
    importSourcesSubtitle.textContent = 'Snapshoty tygodniowe';
    return;
  }

  const width = 1120;
  const height = 280;
  const margin = { top: 18, right: 22, bottom: 48, left: 54 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const values = series.flatMap((row) => breakdownSeriesConfig.map((config) => row[config.key] ?? 0));
  const bounds = getAxisBounds(values, { minValue: 5000, maxValue: 9000 }, 100);
  const minValue = bounds.minValue;
  const maxValue = bounds.maxValue;
  const xForIndex = (index) => margin.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const range = Math.max(1, maxValue - minValue);
  const yForValue = (value) => margin.top + innerHeight - ((value - minValue) / range) * innerHeight;

  const grid = [];
  for (let value = Math.ceil(maxValue / 500) * 500; value >= minValue; value -= 500) {
    const ratio = (value - minValue) / range;
    const y = margin.top + innerHeight - ratio * innerHeight;
    grid.push(`
      <g>
        <line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="rgba(148, 163, 184, 0.14)" />
        <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="#9fb0c7" font-size="12">${formatNumber(value)}</text>
      </g>
    `);
  }

  const xLabels = series.map((row, index) => {
    const prev = series[index - 1];
    const isFirstOfMonth = !prev || row.date.slice(0, 7) !== prev.date.slice(0, 7);
    if (!isFirstOfMonth) return '';
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
      const points = series.map((row, index) => ({ x: xForIndex(index), y: yForValue(row[config.key] ?? 0) }));
      return `
        <path d="${pathFromPoints(points)}" fill="none" stroke="${config.color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${points[points.length - 1].x}" cy="${points[points.length - 1].y}" r="4.5" fill="${config.color}" stroke="rgba(7, 17, 31, 0.9)" stroke-width="2" />
      `;
    })
    .join('');

  breakdownChart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  breakdownChart.innerHTML = `
    ${grid.join('')}
    ${seriesMarkup}
    ${xLabels.join('')}
  `;
  setChartTooltip(breakdownChart, series, { label: 'Liczba ofert' }, breakdownSeriesConfig, width, height, margin);
  breakdownSubtitle.textContent = `${series.length} snapshotów`;
  breakdownLatest.innerHTML = `
    <div class="trend-breakdown-latest-grid">
      ${breakdownSeriesConfig
        .map(
          (config) => `
            <div class="trend-latest-card">
              <span>${config.label}</span>
              <strong>${formatNumber(series[series.length - 1][config.key])}</strong>
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
      label: 'Importy Asari / EstiCRM',
      svgId: 'trend-import-sources-chart',
      latestId: 'trend-import-sources-latest',
      subtitleId: 'trend-import-sources-subtitle',
      seriesDefs: [
        { key: 'asari_imports', label: 'Asari', color: '#60BCB2' },
        { key: 'esti_imports', label: 'EstiCRM', color: '#5D9F4F' },
      ],
      tooltipLabel: 'Importy',
      minValue: 0,
      yTickStep: 500,
      gridStep: 500,
      latestRenderer: (latest) => `
        <div class="trend-breakdown-latest-grid">
          <div class="trend-latest-card">
            <span>Asari</span>
            <strong>${formatNumber(latest.asari_imports)}</strong>
          </div>
          <div class="trend-latest-card">
            <span>EstiCRM</span>
            <strong>${formatNumber(latest.esti_imports)}</strong>
          </div>
        </div>
      `,
    },
  );
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

const metrics = (await loadMetrics()) ?? fallbackMetrics;
renderCards(metrics);
renderImportBreakdown(metrics);
renderTopAgencies(metrics);
attachTableSortHandlers(metrics);
attachTableLimitHandler(metrics);
populateFilters(metrics);
attachFilterHandlers(metrics);
renderTrendCharts(metrics);
