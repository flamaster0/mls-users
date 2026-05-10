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

const seriesConfig = [
  { key: 'offices', label: 'Liczba biur', color: '#7dd3fc' },
  { key: 'agents', label: 'Liczba agentów', color: '#f59e0b' },
  { key: 'offers', label: 'Liczba ofert', color: '#a78bfa' },
];

const state = {
  region: 'ALL',
  city: 'ALL',
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

function renderCards(metrics) {
  const cards = document.querySelectorAll('.card strong');
  metrics.cards.forEach((card, index) => {
    if (cards[index]) {
      cards[index].textContent = formatNumber(card.value);
    }
  });
}

function renderTopAgencies(metrics) {
  const tbody = document.getElementById('top-agencies');
  if (!tbody || !Array.isArray(metrics?.top_agencies) || metrics.top_agencies.length === 0) {
    return;
  }

  tbody.innerHTML = metrics.top_agencies
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${formatNumber(row.active_offers ?? '--')}</td>
          <td>${formatNumber(row.users ?? '--')}</td>
          <td>${formatNumber(row.branches ?? '--')}</td>
        </tr>
      `,
    )
    .join('');
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
  if (!regionSelect || !citySelect) return;

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
}

function buildTrendSeries(metrics) {
  const rows = Array.isArray(metrics?.trend_rows) ? metrics.trend_rows : [];
  const filteredRows = rows.filter((row) => {
    if (state.region !== 'ALL' && row.region !== state.region) return false;
    if (state.city !== 'ALL' && row.city !== state.city) return false;
    return true;
  });

  const grouped = new Map();
  for (const row of filteredRows) {
    const bucket = grouped.get(row.date) ?? {
      date: row.date,
      officesSet: new Set(),
      agents: 0,
      offers: 0,
      onlyMls: 0,
      active: 0,
    };
    if (row.company) bucket.officesSet.add(row.company);
    bucket.agents += Number(row.agents) || 0;
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
      offers: row.offers,
    }));
}

function pathFromPoints(points) {
  if (!points.length) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function renderTrendChart(metrics) {
  const chart = document.getElementById('trend-chart');
  const legendBox = document.getElementById('trend-legend');
  const latestBox = document.getElementById('trend-latest');
  const title = document.getElementById('trend-title');
  const subtitle = document.getElementById('trend-subtitle');
  if (!chart || !legendBox || !latestBox || !title || !subtitle) return;

  const series = buildTrendSeries(metrics);
  if (series.length === 0) {
    chart.innerHTML = '<text x="24" y="48" fill="#9fb0c7">Brak danych dla tego filtra.</text>';
    legendBox.innerHTML = '';
    latestBox.innerHTML = '<div class="trend-placeholder">Brak danych dla tego filtra.</div>';
    title.textContent = 'Trend';
    subtitle.textContent = 'Snapshoty tygodniowe';
    return;
  }

  const width = 1120;
  const height = 420;
  const margin = { top: 24, right: 28, bottom: 44, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const values = series.flatMap((row) => seriesConfig.map((config) => row[config.key] ?? 0));
  const maxValue = Math.max(1, ...values);
  const minValue = 0;

  const xForIndex = (index) => margin.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const yForValue = (value) => margin.top + innerHeight - ((value - minValue) / (maxValue - minValue)) * innerHeight;

  const gridLines = 4;
  const grid = Array.from({ length: gridLines + 1 }, (_, index) => {
    const ratio = index / gridLines;
    const value = Math.round(maxValue * (1 - ratio));
    const y = margin.top + ratio * innerHeight;
    return `
      <g>
        <line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="rgba(148, 163, 184, 0.14)" />
        <text x="${margin.left - 12}" y="${y + 4}" text-anchor="end" fill="#9fb0c7" font-size="12">${formatNumber(value)}</text>
      </g>
    `;
  });

  const xLabels = series.map((row, index) => {
    if (index !== 0 && index !== series.length - 1 && index % 3 !== 0) return '';
    const x = xForIndex(index);
    return `<text x="${x}" y="${height - 12}" text-anchor="middle" fill="#9fb0c7" font-size="12">${escapeHtml(row.date)}</text>`;
  });

  const lines = seriesConfig
    .map((config) => {
      const points = series.map((row, index) => ({ x: xForIndex(index), y: yForValue(row[config.key] ?? 0) }));
      return {
        config,
        points,
        path: pathFromPoints(points),
      };
    })
    .map(({ config, path, points }) => {
      const last = points[points.length - 1];
      return `
        <path d="${path}" fill="none" stroke="${config.color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${last.x}" cy="${last.y}" r="4.5" fill="${config.color}" stroke="rgba(7, 17, 31, 0.9)" stroke-width="2" />
      `;
    })
    .join('');

  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.innerHTML = `
    ${grid.join('')}
    ${lines}
    ${xLabels.join('')}
  `;
  legendBox.innerHTML = seriesConfig
    .map(
      (config) => `
        <span class="trend-legend-item">
          <span class="trend-legend-swatch" style="background:${config.color}"></span>
          ${config.label}
        </span>
      `,
    )
    .join('');

  title.textContent = `Trend: ${state.region === 'ALL' ? 'Wszystkie regiony' : state.region}${state.city === 'ALL' ? '' : ` / ${state.city}`}`;
  subtitle.textContent = `${series.length} snapshotów`;

  const latest = series[series.length - 1];
  latestBox.innerHTML = `
    <div class="trend-latest-grid">
      ${seriesConfig
        .map(
          (config) => `
            <div class="trend-latest-card">
              <span>${config.label}</span>
              <strong>${formatNumber(latest[config.key])}</strong>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
}

function attachFilterHandlers(metrics) {
  const regionSelect = document.getElementById('region-filter');
  const citySelect = document.getElementById('city-filter');
  if (!regionSelect || !citySelect) return;

  regionSelect.addEventListener('change', () => {
    state.region = regionSelect.value;
    state.city = 'ALL';
    populateFilters(metrics);
    renderTrendChart(metrics);
  });

  citySelect.addEventListener('change', () => {
    state.city = citySelect.value;
    renderTrendChart(metrics);
  });
}

const metrics = (await loadMetrics()) ?? fallbackMetrics;
renderCards(metrics);
renderTopAgencies(metrics);
populateFilters(metrics);
attachFilterHandlers(metrics);
renderTrendChart(metrics);
