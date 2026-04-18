/**
 * TriggerForge — Service Worker.
 *
 * Caches the app shell (HTML / CSS / JS / fonts / icons / favicons) so
 * the UI boots offline and reloads are instant. API calls (/api/*) are
 * always pulled from the network — firing a webhook must never use a
 * cached response.
 *
 * Versioning: bumping CACHE_NAME forces a clean install on the next
 * navigation and lets activate() reap the old cache. Clients hear about
 * the pending update via 'updatefound' → we postMessage({type:'SKIP_WAITING'})
 * when the user clicks the "Reload" toast.
 */

const CACHE_NAME = 'tf-v1';

// Paths are relative so the SW works under a subdirectory deployment.
const CORE_ASSETS = [
    './',
    'index.php',
    'admin.php',
    'css/style.css',
    'css/bg.css',
    'css/admin.css',
    'js/app.js',
    'js/particles.js',
    'js/admin.js',
    'assets/icons/boxicons/boxicons.css',
    'assets/fonts/jetbrainsmono/JetBrainsMono-Regular.woff2',
    'assets/fonts/jetbrainsmono/JetBrainsMono-Medium.woff2',
    'assets/fonts/jetbrainsmono/JetBrainsMono-SemiBold.woff2',
    'assets/fonts/jetbrainsmono/JetBrainsMono-Bold.woff2',
    'assets/favicons/favicon.svg',
    'assets/favicons/favicon.ico',
    'assets/favicons/favicon-96x96.png',
    'assets/favicons/apple-touch-icon.png',
    'assets/favicons/web-app-manifest-192x192.png',
    'assets/favicons/web-app-manifest-512x512.png',
    'assets/favicons/site.webmanifest'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // addAll() is all-or-nothing; addOne-per-one tolerates a
            // single missing asset (e.g. a font variant that was
            // removed) without killing install.
            return Promise.all(
                CORE_ASSETS.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('[TF-SW] could not precache', url, err && err.message);
                    })
                )
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names
                .filter((n) => n !== CACHE_NAME && n.indexOf('tf-') === 0)
                .map((n) => caches.delete(n))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return; // never cache mutating requests

    let url;
    try { url = new URL(req.url); }
    catch (e) { return; }

    // Don't intercept cross-origin (Google favicons, etc.) — let the
    // browser manage caching per its own policy.
    if (url.origin !== self.location.origin) return;

    // API endpoints (trigger / import / export / save-config / health)
    // must always reach the network — firing from cache would be
    // surprising and risky.
    if (url.pathname.indexOf('/api/') >= 0) return;

    // Never precache config editor save results. admin.php navigation
    // falls through to normal cache-first like the main page.

    event.respondWith(
        caches.match(req).then((cached) => {
            // Stale-while-revalidate: return the cached copy immediately
            // (if any) and refresh the cache in the background for the
            // next visit. Falls back to the cached copy if the network
            // is unreachable.
            const fetchPromise = fetch(req).then((resp) => {
                if (resp && resp.ok && resp.type === 'basic') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                }
                return resp;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});

// Client-initiated skip-waiting: the page's "Reload" toast posts this
// after a user confirmation so the handoff is intentional, not surprise.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
