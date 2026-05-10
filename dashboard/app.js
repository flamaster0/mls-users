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
  trends: [],
};

function renderCards(metrics) {
  if (!metrics?.cards) return;

  const cards = document.querySelectorAll('.card strong');
  metrics.cards.forEach((card, index) => {
    if (cards[index]) {
      cards[index].textContent = card.value ?? '--';
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
          <td>${row.name}</td>
          <td>${row.active_offers ?? '--'}</td>
          <td>${row.users ?? '--'}</td>
          <td>${row.branches ?? '--'}</td>
        </tr>
      `,
    )
    .join('');
}

function renderTrends(metrics) {
  const root = document.getElementById('trend-list');
  if (!root || !Array.isArray(metrics?.trends) || metrics.trends.length === 0) {
    return;
  }

  const maxUsers = Math.max(...metrics.trends.map((row) => Number(row.users) || 0), 1);
  root.innerHTML = metrics.trends
    .map((row) => {
      const width = Math.max(8, Math.round(((Number(row.users) || 0) / maxUsers) * 100));
      return `
        <div class="trend-row">
          <div class="trend-meta">
            <strong>${row.date}</strong>
            <span>${row.users} users</span>
          </div>
          <div class="trend-bar-track">
            <div class="trend-bar" style="width: ${width}%"></div>
          </div>
          <div class="trend-stats">
            <span>${row.offers} offers</span>
            <span>${row.active} active</span>
          </div>
        </div>
      `;
    })
    .join('');
}

const metrics = (await loadMetrics()) ?? fallbackMetrics;
renderCards(metrics);
renderTopAgencies(metrics);
renderTrends(metrics);
