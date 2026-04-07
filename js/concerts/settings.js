// ============================================================
//  CONCERT SETTINGS — configurable country list & providers
// ============================================================

const CONCERTS_STORAGE_KEY = 'timelinefm_concert_settings';

// Country data: code → name (EU + popular extras)
const AVAILABLE_COUNTRIES = {
  DE: 'Germany', AT: 'Austria', CH: 'Switzerland',
  NL: 'Netherlands', BE: 'Belgium', FR: 'France',
  ES: 'Spain', IT: 'Italy', PT: 'Portugal',
  PL: 'Poland', CZ: 'Czech Republic', DK: 'Denmark',
  SE: 'Sweden', NO: 'Norway', FI: 'Finland',
  IE: 'Ireland', GB: 'United Kingdom',
  HU: 'Hungary', RO: 'Romania', BG: 'Bulgaria',
  HR: 'Croatia', SI: 'Slovenia', SK: 'Slovakia',
  EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania',
  LU: 'Luxembourg', GR: 'Greece', CY: 'Cyprus', MT: 'Malta',
  US: 'United States', CA: 'Canada', AU: 'Australia',
  JP: 'Japan', BR: 'Brazil', MX: 'Mexico', TR: 'Turkey'
};

function loadConcertSettings() {
  try {
    const raw = localStorage.getItem(CONCERTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveConcertSettings(settings) {
  localStorage.setItem(CONCERTS_STORAGE_KEY, JSON.stringify(settings));
}

function getSelectedCountries() {
  const settings = loadConcertSettings();
  if (settings && Array.isArray(settings.countries) && settings.countries.length > 0) {
    return settings.countries;
  }
  return [...DEFAULT_CONCERT_COUNTRIES];
}

function getSelectedProviders() {
  const settings = loadConcertSettings();
  if (settings && Array.isArray(settings.providers) && settings.providers.length > 0) {
    return settings.providers;
  }
  return ['ticketmaster'];
}

function renderSettingsPanel() {
  const panel = document.getElementById('concerts-settings-panel');
  if (!panel) return;

  const selectedCountries = new Set(getSelectedCountries());
  const selectedProviders = new Set(getSelectedProviders());

  let html = `
    <div class="settings-section">
      <div class="settings-label">Concert Providers</div>
      <div class="settings-providers">
        <label class="settings-check">
          <input type="checkbox" value="ticketmaster" ${selectedProviders.has('ticketmaster') ? 'checked' : ''} />
          <span>Ticketmaster</span>
        </label>
        <label class="settings-check">
          <input type="checkbox" value="bandsintown" ${selectedProviders.has('bandsintown') ? 'checked' : ''} />
          <span>Bandsintown</span>
        </label>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-label">Countries to Scan</div>
      <div class="settings-presets">
        <button class="settings-preset-btn" data-preset="eu">EU</button>
        <button class="settings-preset-btn" data-preset="all">All</button>
        <button class="settings-preset-btn" data-preset="none">None</button>
      </div>
      <div class="settings-countries">`;

  // Sort countries alphabetically by name
  const sorted = Object.entries(AVAILABLE_COUNTRIES).sort((a, b) => a[1].localeCompare(b[1]));
  for (const [code, name] of sorted) {
    html += `<label class="settings-check settings-country-check">
      <input type="checkbox" value="${code}" ${selectedCountries.has(code) ? 'checked' : ''} />
      <span>${name}</span>
    </label>`;
  }

  html += `</div></div>
    <button class="btn btn-primary settings-apply-btn" id="settings-apply-btn">Apply & Reload</button>`;

  panel.innerHTML = html;

  // Preset buttons
  panel.querySelectorAll('.settings-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      const checks = panel.querySelectorAll('.settings-country-check input');
      checks.forEach(cb => {
        if (preset === 'all') cb.checked = true;
        else if (preset === 'none') cb.checked = false;
        else if (preset === 'eu') cb.checked = DEFAULT_CONCERT_COUNTRIES.includes(cb.value);
      });
    });
  });

  // Apply button
  document.getElementById('settings-apply-btn').addEventListener('click', () => {
    const countries = [...panel.querySelectorAll('.settings-country-check input:checked')]
      .map(cb => cb.value);
    const providers = [...panel.querySelectorAll('.settings-providers input:checked')]
      .map(cb => cb.value);

    if (countries.length === 0) {
      alert('Please select at least one country.');
      return;
    }
    if (providers.length === 0) {
      alert('Please select at least one provider.');
      return;
    }

    saveConcertSettings({ countries, providers, ttlDays: getCacheTtlDays() });
    // Reload page to apply
    window.location.reload();
  });
}

function getCacheTtlDays() {
  const settings = loadConcertSettings();
  return settings?.ttlDays || 3;
}

function toggleSettingsPanel() {
  const panel = document.getElementById('concerts-settings-panel');
  const overlay = document.getElementById('concerts-settings-overlay');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open', isOpen);
  if (isOpen) renderSettingsPanel();
}
