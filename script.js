/* ═══════════════════════════════════════════════════════════
   CS2 VAULT — MARKETPLACE SCRIPT
   API: fetch("https://cs2-market-backend-fg5b.onrender.com/api/skins")
   Özellikler: Listeleme, Filtreleme, Sıralama, Sayfalama,
               Spotlight bölümleri, Steam yönlendirme
═══════════════════════════════════════════════════════════ */

// ── CONSTANTS ────────────────────────────────────────────
const API_BASE   = 'https://cs2-market-backend-fg5b.onrender.com/api/skins';
const GAME       = 'cs2';
const PAGE_SIZE  = 24;   // Sayfa başına kart sayısı
const SPOTLIGHT_COUNT = 5; // En ucuz / en pahalı bölüm sayısı

// ── STATE ────────────────────────────────────────────────
const state = {
  allSkins:      [],   // API'den gelen ham veri (tüm sayfalar veya mevcut sayfa)
  filtered:      [],   // Filtre uygulanmış veri
  currentPage:   1,
  totalPages:    1,
  loading:       false,
  sort:          'price-asc',

  filters: {
    search:   '',
    priceMin: '',
    priceMax: '',
    wear:     '',
    type:     '',
  },
};

// ── DOM REF ──────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const DOM = {
  grid:         $('skin-grid'),
  loading:      $('loading'),
  errorState:   $('error-state'),
  errorMsg:     $('error-msg'),
  emptyState:   $('empty-state'),
  resultCount:  $('result-count'),
  pageInfo:     $('page-info'),
  pagination:   $('pagination'),
  pageNumbers:  $('page-numbers'),
  btnPrev:      $('btn-prev'),
  btnNext:      $('btn-next'),
  btnRetry:     $('btn-retry'),
  btnApply:     $('btn-apply'),
  btnClear:     $('btn-clear'),
  searchInput:  $('search-input'),
  priceMin:     $('price-min'),
  priceMax:     $('price-max'),
  filterWear:   $('filter-wear'),
  filterType:   $('filter-type'),
  cheapestList: $('cheapest-list'),
  expensiveList:$('expensive-list'),
  statTotal:    $('stat-total'),
  statMin:      $('stat-min'),
  statMax:      $('stat-max'),
  modalOverlay: $('modal-overlay'),
  modalContent: $('modal-content'),
  modalClose:   $('modal-close'),
};

// ── WEAR UTILITY ─────────────────────────────────────────
/**
 * Wear değerine göre CSS sınıfı döndürür
 * @param {string} wear - Wear string
 * @returns {string} CSS class suffix
 */
function wearClass(wear = '') {
  const map = {
    'Factory New':    'factory-new',
    'Minimal Wear':   'minimal-wear',
    'Field-Tested':   'field-tested',
    'Well-Worn':      'well-worn',
    'Battle-Scarred': 'battle-scarred',
  };
  return map[wear] || 'field-tested';
}

/**
 * Skin adından "tür" bilgisini çıkartır (AK-47, Knife vs.)
 * Format genelde: "Weapon | Skin Name (Wear)" veya sadece name
 */
function extractType(skin) {
  // API'de "type" veya "category" alanı varsa kullan
  if (skin.type)      return skin.type;
  if (skin.category)  return skin.category;
  if (skin.weapon)    return skin.weapon;

  // Yoksa isimden çıkar (AK-47 | Redline formatı)
  const name = skin.name || skin.market_hash_name || '';
  const pipeIdx = name.indexOf('|');
  if (pipeIdx !== -1) return name.slice(0, pipeIdx).trim();

  // Yaygın silah isimleri
  const weapons = [
    'AK-47','M4A4','M4A1-S','AWP','Glock-18','USP-S','P250','Desert Eagle',
    'Karambit','Butterfly Knife','Bayonet','Flip Knife','Gut Knife',
    'Huntsman Knife','Falchion Knife','Shadow Daggers','M9 Bayonet',
    'Bowie Knife','Stiletto Knife','Ursus Knife','Talon Knife','Navaja Knife',
    'Skeleton Knife','Paracord Knife','Survival Knife','Classic Knife',
    'SG 553','AUG','FAMAS','Galil AR','MP9','MAC-10','MP7','MP5-SD',
    'UMP-45','PP-Bizon','P90','Nova','XM1014','Sawed-Off','MAG-7','M249','Negev',
    'Five-SeveN','CZ75-Auto','Tec-9','Dual Berettas','P2000','R8 Revolver',
    'SSG 08','SCAR-20','G3SG1','FAMAS','Sticker','Graffiti','Souvenir',
  ];
  for (const w of weapons) {
    if (name.includes(w)) return w;
  }
  return 'Other';
}

/**
 * Fiyatı formatlar: $1,234.56
 */
function formatPrice(price) {
  if (price == null || price === '') return '$—';
  return '$' + parseFloat(price).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Steam Market URL'si oluşturur
 */
function steamUrl(name) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`;
}

// ── API FETCH ────────────────────────────────────────────
/**
 * API'den skin verilerini çeker
 * @param {number} page - Sayfa numarası
 */
async function fetchSkins(page = 1) {
  showLoading(true);
  hideError();
  hideEmpty();

  try {
    const params = new URLSearchParams({
      game:  GAME,
      page:  page,
      limit: PAGE_SIZE,
    });

    const response = await fetch(`${API_BASE}?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`API Hatası: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // API yanıt yapısını normalize et
    // Olası formatlar: { data: [], total: N } | { skins: [] } | []
    let skins = [];
    let total = 0;

    if (Array.isArray(data)) {
      skins = data;
      total = data.length;
    } else if (data.data && Array.isArray(data.data)) {
      skins = data.data;
      total = data.total || data.data.length;
    } else if (data.skins && Array.isArray(data.skins)) {
      skins = data.skins;
      total = data.total || data.skins.length;
    } else if (data.items && Array.isArray(data.items)) {
      skins = data.items;
      total = data.total || data.items.length;
    } else {
      // Bilinmeyen format — objeyi dizi olarak dene
      const vals = Object.values(data);
      const firstArr = vals.find(v => Array.isArray(v));
      if (firstArr) {
        skins = firstArr;
        total = firstArr.length;
      }
    }

    // Her skine tür alanı ekle (yoksa çıkar)
    skins = skins.map(s => ({
      ...s,
      _type: extractType(s),
      _name: s.name || s.market_hash_name || s.hash_name || 'Bilinmeyen',
      _price: parseFloat(s.price || s.price_usd || s.steam_price || 0),
      _wear:  s.wear || s.exterior || s.condition || '',
      _image: s.image || s.icon_url || s.img || s.picture || '',
    }));

    state.allSkins    = skins;
    state.currentPage = page;

    // Toplam sayfa sayısı
    if (data.total_pages) {
      state.totalPages = data.total_pages;
    } else if (data.last_page) {
      state.totalPages = data.last_page;
    } else {
      state.totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    }

    // İlk yüklemede spotlight & filtre seçeneklerini hazırla
    if (page === 1) {
      buildTypeFilter(skins);
      updateHeaderStats(skins);
      renderSpotlight(skins);
    }

    // Filtre & render
    applyFilters();

  } catch (err) {
    console.error('[CS2VAULT]', err);
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

// ── FILTER & SORT ─────────────────────────────────────────
/**
 * Mevcut filtreleri state'e okur ve uygular
 */
function readFilters() {
  state.filters.search   = DOM.searchInput.value.trim().toLowerCase();
  state.filters.priceMin = DOM.priceMin.value;
  state.filters.priceMax = DOM.priceMax.value;
  state.filters.wear     = DOM.filterWear.value;
  state.filters.type     = DOM.filterType.value;
}

/**
 * Filtreleri uygular, sonuçları sıralar ve render eder
 */
function applyFilters() {
  readFilters();
  let result = [...state.allSkins];

  const { search, priceMin, priceMax, wear, type } = state.filters;

  // Arama filtresi
  if (search) {
    result = result.filter(s =>
      s._name.toLowerCase().includes(search)
    );
  }

  // Minimum fiyat
  if (priceMin !== '') {
    result = result.filter(s => s._price >= parseFloat(priceMin));
  }

  // Maximum fiyat
  if (priceMax !== '') {
    result = result.filter(s => s._price <= parseFloat(priceMax));
  }

  // Wear filtresi
  if (wear) {
    result = result.filter(s => s._wear === wear);
  }

  // Tür filtresi
  if (type) {
    result = result.filter(s => s._type === type);
  }

  // Sıralama
  switch (state.sort) {
    case 'price-asc':
      result.sort((a, b) => a._price - b._price);
      break;
    case 'price-desc':
      result.sort((a, b) => b._price - a._price);
      break;
    case 'name-asc':
      result.sort((a, b) => a._name.localeCompare(b._name));
      break;
    case 'name-desc':
      result.sort((a, b) => b._name.localeCompare(a._name));
      break;
  }

  state.filtered = result;
  renderGrid(result);
  updatePagination();
  updateResultCount(result.length);
}

// ── RENDER FUNCTIONS ─────────────────────────────────────

/**
 * Ana skin grid'ini render eder
 */
function renderGrid(skins) {
  DOM.grid.innerHTML = '';

  if (!skins || skins.length === 0) {
    showEmpty(true);
    return;
  }

  showEmpty(false);
  const fragment = document.createDocumentFragment();

  skins.forEach(skin => {
    const card = createSkinCard(skin);
    fragment.appendChild(card);
  });

  DOM.grid.appendChild(fragment);
}

/**
 * Tek bir skin kartı oluşturur
 * @param {Object} skin - Skin verisi
 * @returns {HTMLElement}
 */
function createSkinCard(skin) {
  const wc    = wearClass(skin._wear);
  const isStatTrak = skin._name.toLowerCase().includes('stattrak');
  const isSouvenir = skin._name.toLowerCase().includes('souvenir');

  const card = document.createElement('div');
  card.className = `skin-card wear--${wc}`;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${skin._name} - ${formatPrice(skin._price)}`);

  // StatTrak veya Souvenir badge
  let badgeHTML = '';
  if (isStatTrak) {
    badgeHTML = `<span class="badge-stattrak">★ ST™</span>`;
  } else if (isSouvenir) {
    badgeHTML = `<span class="badge-souvenir">SOUVENIR</span>`;
  }

  // Görsel: fallback placeholder
  const imgSrc = skin._image || '';
  const imgHTML = imgSrc
    ? `<img class="card-img" src="${escapeHTML(imgSrc)}" alt="${escapeHTML(skin._name)}" loading="lazy" onerror="this.src='';this.style.display='none'">`
    : `<div class="card-img" style="width:80px;height:60px;background:rgba(255,107,0,0.05);border-radius:4px;"></div>`;

  card.innerHTML = `
    <div class="card-stripe"></div>
    <div class="card-img-wrap">
      ${imgHTML}
      ${badgeHTML}
    </div>
    <div class="card-body">
      <div class="card-type">${escapeHTML(skin._type)}</div>
      <div class="card-name">${escapeHTML(skin._name)}</div>
      <div class="card-wear">
        <span class="wear-dot"></span>
        <span class="wear-label">${escapeHTML(skin._wear) || 'N/A'}</span>
      </div>
      <div class="card-footer">
        <span class="card-price">${formatPrice(skin._price)}</span>
        <span class="card-steam-icon" title="Steam Market'e git">↗</span>
      </div>
    </div>
  `;

  // Tıklama: Steam Market yönlendirmesi
  const handleClick = (e) => {
    // Orta tık veya Ctrl+tık → yeni tab
    const url = steamUrl(skin._name);
    if (e.ctrlKey || e.metaKey || e.button === 1) {
      window.open(url, '_blank', 'noopener');
    } else {
      window.open(url, '_blank', 'noopener');
    }
  };

  card.addEventListener('click', handleClick);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') handleClick(e);
  });

  return card;
}

/**
 * Spotlight (En Ucuz / En Pahalı) bölümlerini render eder
 */
function renderSpotlight(skins) {
  if (!skins || skins.length === 0) return;

  // Fiyatı olan skinleri filtrele
  const withPrice = skins.filter(s => s._price > 0);

  // En ucuz 5
  const cheapest = [...withPrice]
    .sort((a, b) => a._price - b._price)
    .slice(0, SPOTLIGHT_COUNT);

  // En pahalı 5
  const expensive = [...withPrice]
    .sort((a, b) => b._price - a._price)
    .slice(0, SPOTLIGHT_COUNT);

  DOM.cheapestList.innerHTML  = cheapest.map((s, i)  => spotlightItemHTML(s, i + 1)).join('');
  DOM.expensiveList.innerHTML = expensive.map((s, i) => spotlightItemHTML(s, i + 1)).join('');

  // Spotlight item tıklama
  DOM.cheapestList.querySelectorAll('.spotlight-item').forEach(el => {
    el.addEventListener('click', () => window.open(el.dataset.url, '_blank', 'noopener'));
  });
  DOM.expensiveList.querySelectorAll('.spotlight-item').forEach(el => {
    el.addEventListener('click', () => window.open(el.dataset.url, '_blank', 'noopener'));
  });
}

/**
 * Spotlight item HTML'ini döndürür
 */
function spotlightItemHTML(skin, rank) {
  const imgSrc = skin._image || '';
  const imgTag = imgSrc
    ? `<img class="spotlight-img" src="${escapeHTML(imgSrc)}" alt="${escapeHTML(skin._name)}" loading="lazy" onerror="this.style.display='none'">`
    : '';

  return `
    <div class="spotlight-item" role="button" tabindex="0" data-url="${escapeHTML(steamUrl(skin._name))}">
      <span class="spotlight-rank">#${rank}</span>
      ${imgTag}
      <div class="spotlight-info">
        <div class="spotlight-name">${escapeHTML(skin._name)}</div>
        <div class="spotlight-wear">${escapeHTML(skin._wear) || 'N/A'}</div>
      </div>
      <span class="spotlight-price">${formatPrice(skin._price)}</span>
    </div>
  `;
}

/**
 * Header istatistik chiplerini günceller
 */
function updateHeaderStats(skins) {
  const withPrice = skins.filter(s => s._price > 0);
  const prices = withPrice.map(s => s._price);

  DOM.statTotal.querySelector('.stat-val').textContent = skins.length;
  DOM.statMin.querySelector('.stat-val').textContent   = prices.length ? formatPrice(Math.min(...prices)) : '$—';
  DOM.statMax.querySelector('.stat-val').textContent   = prices.length ? formatPrice(Math.max(...prices)) : '$—';
}

/**
 * Sonuç sayısını günceller
 */
function updateResultCount(count) {
  DOM.resultCount.textContent = `${count} SKIN BULUNDU`;
  DOM.pageInfo.textContent    = `SAYFA ${state.currentPage} / ${state.totalPages}`;
}

/**
 * Pagination'ı günceller
 */
function updatePagination() {
  const { currentPage, totalPages } = state;

  DOM.btnPrev.disabled = currentPage <= 1;
  DOM.btnNext.disabled = currentPage >= totalPages;

  // Sayfa numaraları (maksimum 7 göster)
  DOM.pageNumbers.innerHTML = '';
  const pages = getPageRange(currentPage, totalPages);

  pages.forEach(p => {
    if (p === '...') {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'page-num';
      ellipsis.textContent = '…';
      ellipsis.style.cursor = 'default';
      ellipsis.style.opacity = '0.4';
      DOM.pageNumbers.appendChild(ellipsis);
    } else {
      const btn = document.createElement('button');
      btn.className = `page-num${p === currentPage ? ' active' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => goToPage(p));
      DOM.pageNumbers.appendChild(btn);
    }
  });
}

/**
 * Sayfa numarası aralığını hesaplar (örn: 1 ... 4 5 6 ... 20)
 */
function getPageRange(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total);
  } else if (current >= total - 3) {
    pages.push(1, '...', total-4, total-3, total-2, total-1, total);
  } else {
    pages.push(1, '...', current-1, current, current+1, '...', total);
  }
  return pages;
}

/**
 * Belirtilen sayfaya gider
 */
function goToPage(page) {
  if (page < 1 || page > state.totalPages || page === state.currentPage) return;
  fetchSkins(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Tür filtresi seçeneklerini doldurur
 */
function buildTypeFilter(skins) {
  const types = [...new Set(skins.map(s => s._type).filter(Boolean))].sort();
  DOM.filterType.innerHTML = '<option value="">Tümü</option>';
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    DOM.filterType.appendChild(opt);
  });
}

// ── UI STATE HELPERS ─────────────────────────────────────

function showLoading(show) {
  DOM.loading.style.display = show ? 'flex' : 'none';
  state.loading = show;
}

function showError(msg) {
  DOM.errorState.style.display = 'flex';
  DOM.errorMsg.textContent = msg || 'Beklenmedik bir hata oluştu.';
  DOM.grid.innerHTML = '';
}

function hideError() {
  DOM.errorState.style.display = 'none';
}

function showEmpty(show) {
  DOM.emptyState.style.display = show ? 'flex' : 'none';
}

function hideEmpty() {
  DOM.emptyState.style.display = 'none';
}

// ── SECURITY ─────────────────────────────────────────────
/**
 * XSS önlemi için HTML escape
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── EVENT LISTENERS ──────────────────────────────────────

// Filtre uygula butonu
DOM.btnApply.addEventListener('click', () => {
  applyFilters();
});

// Enter ile arama
DOM.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyFilters();
});

// Gerçek zamanlı arama (debounced)
let searchDebounce;
DOM.searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(applyFilters, 350);
});

// Temizle butonu
DOM.btnClear.addEventListener('click', () => {
  DOM.searchInput.value  = '';
  DOM.priceMin.value     = '';
  DOM.priceMax.value     = '';
  DOM.filterWear.value   = '';
  DOM.filterType.value   = '';

  state.filters = { search: '', priceMin: '', priceMax: '', wear: '', type: '' };

  // Sort butonlarını sıfırla
  DOM.sortButtons?.forEach(btn => btn.classList.remove('active'));
  document.querySelector('[data-sort="price-asc"]')?.classList.add('active');
  state.sort = 'price-asc';

  applyFilters();
});

// Sıralama butonları
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.sort = btn.dataset.sort;
    applyFilters();
  });
});

// Pagination butonları
DOM.btnPrev.addEventListener('click', () => goToPage(state.currentPage - 1));
DOM.btnNext.addEventListener('click', () => goToPage(state.currentPage + 1));

// Yeniden dene
DOM.btnRetry.addEventListener('click', () => fetchSkins(state.currentPage));

// Modal kapat
DOM.modalClose.addEventListener('click', closeModal);
DOM.modalOverlay.addEventListener('click', (e) => {
  if (e.target === DOM.modalOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  DOM.modalOverlay.style.display = 'none';
}

// Wear / type filtresi değiştiğinde otomatik uygula (opsiyonel UX)
DOM.filterWear.addEventListener('change', applyFilters);
DOM.filterType.addEventListener('change', applyFilters);

// ── INIT ─────────────────────────────────────────────────
/**
 * Uygulamayı başlatır
 */
function init() {
  console.log('%c[CS2VAULT] Marketplace başlatılıyor...', 'color:#ff6b00;font-weight:bold;');
  fetchSkins(1);
}

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', init);
