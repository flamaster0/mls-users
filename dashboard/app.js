async function loadMetrics() {
  try {
    const response = await fetch('../data/processed/dashboard.json', { cache: 'no-store' });
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

const metrics = (await loadMetrics()) ?? fallbackMetrics;
renderCards(metrics);
renderTopAgencies(metrics);
