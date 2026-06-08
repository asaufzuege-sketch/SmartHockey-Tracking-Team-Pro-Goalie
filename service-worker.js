// KRITISCH: Feste Version, die bei JEDER Änderung erhöht werden muss!
const CACHE_VERSION = 'v3.3.1';
const CACHE_NAME = 'smarthockey-' + CACHE_VERSION;

const imageUrlsToCacheIndividually = [
  './Spielfeld Overlay.png',
  './Tor Grün.png',
  './Tor Rot.png'
];
const imageUrlsToCacheIndividuallySet = new Set(imageUrlsToCacheIndividually);

const urlsToCache = [
  './',
  './index.html?v=' + CACHE_VERSION,
  './style.css?v=' + CACHE_VERSION,
  './season_table_styles.css?v=' + CACHE_VERSION,
  './season_map_momentum.css?v=' + CACHE_VERSION,
  './js/app.js?v=' + CACHE_VERSION,
  './js/core/config.js?v=' + CACHE_VERSION,
  './js/core/helpers.js?v=' + CACHE_VERSION,
  './js/utils/storage.js?v=' + CACHE_VERSION,
  './js/utils/marker-handler.js?v=' + CACHE_VERSION,
  './js/modules/team-selection.js?v=' + CACHE_VERSION,
  './js/modules/player-selection.js?v=' + CACHE_VERSION,
  './js/modules/stats-table.js?v=' + CACHE_VERSION,
  './js/modules/season-table.js?v=' + CACHE_VERSION,
  './js/modules/goal-map.js?v=' + CACHE_VERSION,
  './js/modules/season-map.js?v=' + CACHE_VERSION,
  './js/modules/goal-value.js?v=' + CACHE_VERSION,
  './js/modules/line-up.js?v=' + CACHE_VERSION,
  './js/modules/csv-handler.js?v=' + CACHE_VERSION,
  './js/modules/timer.js?v=' + CACHE_VERSION,
  './js/modules/page-info.js?v=' + CACHE_VERSION,
  './js/modules/theme-toggle.js?v=' + CACHE_VERSION,
  './js/modules/billing.js?v=' + CACHE_VERSION,
  './season_table_ui_patch.js?v=' + CACHE_VERSION,
  './season_map_momentum.js?v=' + CACHE_VERSION,
  './enhancements-wakelock.js?v=' + CACHE_VERSION,
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  ...imageUrlsToCacheIndividually
];

// Install: Cache alle Dateien
self.addEventListener('install', event => {
  console.log('[SW] Installing new version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching files');
        const addAllUrls = urlsToCache.filter(url => !imageUrlsToCacheIndividuallySet.has(url));
        return cache.addAll(addAllUrls).then(async () => {
          for (const imageUrl of imageUrlsToCacheIndividually) {
            try {
              await cache.add(imageUrl);
            } catch (err) {
              console.log('[SW] Failed to cache image:', imageUrl, err);
            }
          }
        });
      })
      .then(() => {
        console.log('[SW] All files cached');
        return self.skipWaiting(); // KRITISCH: Sofort aktivieren!
      })
      .catch(err => {
        console.log('[SW] Cache addAll failed:', err);
      })
  );
});

// Activate: ALLE alten Caches löschen
self.addEventListener('activate', event => {
  console.log('[SW] Activating new version:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Claiming all clients');
      return self.clients.claim(); // KRITISCH: Alle Tabs übernehmen!
    })
  );
});

// Fetch: Network-First Strategie für HTML/JS/CSS
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Für HTML, JS, CSS: Immer zuerst vom Netzwerk holen
  if (event.request.destination === 'document' ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Speichere im Cache für offline
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Offline: Aus Cache laden
          return caches.match(event.request);
        })
    );
  } else {
    // Für andere Ressourcen (Bilder, etc.): Cache-First
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            // Cache only same-origin app assets here (response.type === 'basic').
            // Cross-origin/opaque assets are intentionally excluded.
            if (response && response.ok && response.type === 'basic') {
              const clone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clone))
                .catch(err => {
                  console.log('[SW] Failed to cache runtime resource:', event.request.url, err);
                });
            }
            return response;
          });
      })
    );
  }
});
