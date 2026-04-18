/**
 * TriggerForge - Dark Theme Premium
 * Complete JavaScript with all Premium Features
 */

// === Global State ===
const state = {
    favorites: [],
    cooldowns: {},
    categoryStates: {},
    isTestMode: false,
    settings: {},
    lastTriggered: {},
    triggerCounts: {},
    itemOrder: {}, // per-category arrays of item ids, produced by drag-sort
    history: []    // newest-first ring buffer of the last MAX_HISTORY fires
};

// === Constants ===
const COOLDOWN_DURATION = 10000; // 10 seconds
const TOAST_DURATION = 4000; // 4 seconds
const MAX_FAVORITES = 10;
const MAX_TOASTS = 5; // cap concurrent toasts to prevent DOM bloat on spam
const MAX_HISTORY = 50; // ring-buffer cap for state.history
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

// === Settings ===
// Central default object. Every new feature adds its default here; persisted
// settings are deep-merged against this so new keys in a release don't leave
// upgrading users with `undefined` values. `features.*` gates any feature
// whose incomplete state could confuse the user — switch to `true` once the
// feature is stable.
const DEFAULT_SETTINGS = {
    // Appearance
    theme: 'dark',                // 'dark' | 'light' | 'auto'
    accent: 'orange',             // 'orange' | 'blue' | 'green' | 'red' | 'violet' | 'pink'
    density: 'comfortable',       // 'compact' | 'comfortable' | 'spacious'
    layout: 'grid',               // 'grid' | 'list'
    particles: 'standard',        // 'standard' | 'minimal' | 'off'
    fontScale: 1,                 // 0.875 | 1 | 1.125 | 1.25
    // Behavior
    sortOrder: 'config',          // 'config' | 'alphabet' | 'lastUsed' | 'mostUsed'
    showCounters: false,
    showLastTriggered: true,
    haptic: true,
    favoritesCollapsed: false,
    // Opt-in experimental / permission-requiring toggles. Flat keys so
    // the settings-modal checkbox wiring stays trivial.
    enablePullToRefresh: false,
    enableOfflineQueue: false,
    enablePushNotifications: false
};

/**
 * Deep-merge a persisted settings object against DEFAULT_SETTINGS. Keys in
 * `saved` that are not in DEFAULT_SETTINGS are dropped (forward-compat: a
 * downgrade doesn't carry unknown keys forward). Missing keys fall back to
 * the default. Type-mismatched keys (e.g. saved theme === 42) fall back too.
 */
function mergeSettings(saved) {
    const out = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        const def = DEFAULT_SETTINGS[key];
        const val = saved && typeof saved === 'object' ? saved[key] : undefined;
        if (def !== null && typeof def === 'object' && !Array.isArray(def)) {
            // Recurse into object values (e.g. `features`).
            out[key] = mergeSettings.call(null, val);
            // But keep the default's keys, not the saved's
            const merged = {};
            for (const subKey of Object.keys(def)) {
                const subDef = def[subKey];
                const subVal = val && typeof val === 'object' ? val[subKey] : undefined;
                merged[subKey] = typeof subVal === typeof subDef ? subVal : subDef;
            }
            out[key] = merged;
        } else if (typeof val === typeof def) {
            out[key] = val;
        } else {
            out[key] = def;
        }
    }
    return out;
}

function isSafeLinkUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url, window.location.href);
        return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol);
    } catch (e) {
        return false;
    }
}

// === Pull-to-Refresh ===
// Opt-in (Settings > Behavior). Active only on touch devices at
// scrollY === 0. Drag past 80 px reloads the page. Visual indicator at
// top-center fades in proportional to the pull depth and rotates on
// travel — classic mobile convention.
function initPullToRefresh() {
    if (!state.settings.enablePullToRefresh) return;
    if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;

    const indicator = document.getElementById('ptrIndicator');
    const threshold = 80;
    let startY = 0;
    let active = false;

    document.addEventListener('touchstart', (e) => {
        if (window.scrollY > 0) { active = false; return; }
        if (!e.touches || e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
        active = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!active) return;
        if (window.scrollY > 0) {
            active = false;
            if (indicator) { indicator.style.opacity = '0'; indicator.style.transform = ''; }
            return;
        }
        const dy = e.touches[0].clientY - startY;
        if (dy <= 0) return;
        if (indicator) {
            const progress = Math.min(dy / threshold, 1);
            indicator.style.opacity = String(progress);
            indicator.style.transform = 'translate(-50%, ' + Math.min(dy, threshold) + 'px) rotate(' + (progress * 360) + 'deg)';
        }
    }, { passive: true });

    const end = (e) => {
        if (!active) return;
        active = false;
        const endY = (e && e.changedTouches && e.changedTouches[0])
            ? e.changedTouches[0].clientY
            : startY;
        const dy = endY - startY;
        if (indicator) {
            indicator.style.transition = 'opacity 200ms ease, transform 200ms ease';
            indicator.style.opacity = '0';
            indicator.style.transform = '';
            setTimeout(() => { if (indicator) indicator.style.transition = ''; }, 220);
        }
        if (dy >= threshold && window.scrollY === 0) {
            window.location.reload();
        }
    };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
}

// === Service Worker registration ===
// Precache app shell + stale-while-revalidate for fast repeat visits and
// working offline-UI. API calls are never cached. On SW update, surface
// a "Reload" toast; the user explicitly opts in to swap SWs.
function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('sw.js', { scope: './' })
        .then((reg) => {
            // Periodic update check — re-fetches sw.js, triggers a new
            // install if the file changed. 1 hour is a reasonable
            // compromise between freshness and server load.
            setInterval(() => { reg.update().catch(() => {}); }, 3600000);

            reg.addEventListener('updatefound', () => {
                const worker = reg.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    // "installed" while a controller exists → a NEW SW
                    // is waiting. Without a controller it's the very
                    // first install — no user-facing action needed.
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        showSWUpdateToast(worker);
                    }
                });
            });
        })
        .catch((err) => console.warn('[TF] SW registration failed:', err));

    // When the controller changes (user clicked "Reload" → skipWaiting()
    // → new SW activates), reload the page so the fresh JS/CSS become
    // the live copy. Debounce to avoid reload loops.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

function showSWUpdateToast(worker) {
    showToast('A new version is available', 'info', {
        label: 'Reload',
        onClick: () => worker.postMessage({ type: 'SKIP_WAITING' })
    }, 30000);
}

// === PWA Install Prompt ===
// Chrome / Edge fire `beforeinstallprompt` when the app is installable.
// We stash the event and surface an "Install as app" button in Settings.
// Safari uses its own "Add to Home Screen" share-menu path — nothing
// we can trigger programmatically — so the button just stays hidden
// there. Fires `appinstalled` once install completes.
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    const section = document.getElementById('settingsAppSection');
    if (section) section.hidden = false;
});
window.addEventListener('appinstalled', () => {
    _deferredInstallPrompt = null;
    const section = document.getElementById('settingsAppSection');
    if (section) section.hidden = true;
    if (typeof showToast === 'function') {
        showToast('TriggerForge installed', 'success');
    }
});

// === Global Error Boundary ===
// Surface uncaught JS errors instead of letting them die silently in the
// console. Rate-limited to one toast per 10 s so an error storm doesn't
// carpet-bomb the UI with red toasts. Registered at module load — earlier
// than initTriggerForge — so boot-time errors are captured too. If the
// toast container doesn't exist yet (pre-init), we still log to console.
let _lastBoundaryToastAt = 0;
const _BOUNDARY_TOAST_COOLDOWN = 10000;
function reportBoundaryError() {
    const now = Date.now();
    if (now - _lastBoundaryToastAt < _BOUNDARY_TOAST_COOLDOWN) return;
    _lastBoundaryToastAt = now;
    if (typeof showToast === 'function' && document.getElementById('toastContainer')) {
        showToast('Something broke — see console (F12)', 'error');
    }
}
window.addEventListener('error', (e) => {
    console.error('[TriggerForge] uncaught error:', e.error || e.message, e);
    reportBoundaryError();
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[TriggerForge] unhandled promise rejection:', e.reason);
    reportBoundaryError();
});

// === Initialization ===
function initTriggerForge() {
    console.log('🚀 TriggerForge Premium Loading...');

    // Mark decorative Boxicons as aria-hidden so screen readers don't
    // announce their private-use glyph characters as "unknown symbol".
    // Buttons containing icons already carry their own aria-label. Skip
    // the favorite stars — they're interactive (click handlers) and need
    // to stay announceable via their title attribute.
    document.querySelectorAll('i[class^="bx"], i[class*=" bx"]').forEach(icon => {
        if (icon.classList.contains('trigger-btn-favorite') ||
            icon.classList.contains('link-btn-favorite')) {
            return;
        }
        if (!icon.hasAttribute('aria-hidden')) {
            icon.setAttribute('aria-hidden', 'true');
        }
    });

    // Load state from LocalStorage
    loadState();

    // Apply persisted look-and-feel BEFORE any init so that category icons,
    // density, layout, font-scale, etc. already match the user's preferences
    // on first paint (no visible re-layout after JS boot).
    applySettings();

    // Initialize all modules
    initAccordion();
    initFavorites();
    initWebhookButtons();
    initLinkButtons();
    initModeToggle();
    initConfirmationModal();
    initGenericModal();
    initSettings();
    initSearch();
    initKeyboardShortcuts();
    initTriggerWidgets();
    initDragSort();
    applyItemOrder();
    initChainButtons();
    initHistory();
    initBulkFire();
    initScrollToTop();
    initServiceWorker();
    initPullToRefresh();

    // Restore cooldowns from previous session
    restoreCooldowns();

    console.log('✅ TriggerForge Premium Ready!');
}

// Run init now if the DOM is already parsed, otherwise wait for it.
// The naïve `addEventListener('DOMContentLoaded', ...)` never fires when
// the script is injected into an already-loaded document (bfcache
// restore, dynamic inserts), which would leave the app uninitialised.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTriggerForge);
} else {
    initTriggerForge();
}

// === State Management ===
function loadStateKey(key, fallback, validator) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        if (validator && !validator(parsed)) return fallback;
        return parsed;
    } catch (e) {
        console.warn(`Error loading state key "${key}":`, e);
        return fallback;
    }
}

function loadState() {
    state.favorites = loadStateKey('triggerforge_favorites', [], Array.isArray);
    state.categoryStates = loadStateKey(
        'triggerforge_categories_state',
        {},
        v => v !== null && typeof v === 'object' && !Array.isArray(v)
    );
    state.cooldowns = loadStateKey(
        'triggerforge_cooldowns',
        {},
        v => v !== null && typeof v === 'object' && !Array.isArray(v)
    );
    state.isTestMode = loadStateKey(
        'triggerforge_test_mode',
        false,
        v => typeof v === 'boolean'
    );
    state.settings = mergeSettings(loadStateKey(
        'triggerforge_settings',
        {},
        v => v !== null && typeof v === 'object' && !Array.isArray(v)
    ));
    state.lastTriggered = loadStateKey(
        'triggerforge_last_triggered',
        {},
        v => v !== null && typeof v === 'object' && !Array.isArray(v)
    );
    state.triggerCounts = loadStateKey(
        'triggerforge_trigger_counts',
        {},
        v => v !== null && typeof v === 'object' && !Array.isArray(v)
    );
    state.itemOrder = loadStateKey(
        'triggerforge_item_order',
        {},
        v => v !== null && typeof v === 'object' && !Array.isArray(v)
    );
    state.history = loadStateKey(
        'triggerforge_history',
        [],
        v => Array.isArray(v)
    );
    if (state.history.length > MAX_HISTORY) {
        // Paranoia: if a future build increased MAX_HISTORY and then rolled
        // back, trim back on boot rather than ship the oversize buffer
        // around forever.
        state.history.length = MAX_HISTORY;
    }
}

function saveState() {
    // Write each key independently so a quota error on one key doesn't
    // leave the remaining keys stale and out of sync with in-memory state.
    const writes = [
        ['triggerforge_favorites', state.favorites],
        ['triggerforge_categories_state', state.categoryStates],
        ['triggerforge_cooldowns', state.cooldowns],
        ['triggerforge_test_mode', state.isTestMode],
        ['triggerforge_settings', state.settings],
        ['triggerforge_last_triggered', state.lastTriggered],
        ['triggerforge_trigger_counts', state.triggerCounts],
        ['triggerforge_item_order', state.itemOrder],
        ['triggerforge_history', state.history]
    ];
    writes.forEach(([key, value]) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn(`Error saving state key "${key}":`, e);
        }
    });
}

// === Accordion Functionality ===
function initAccordion() {
    const categoryHeaders = document.querySelectorAll('.category-header');

    // Prune categoryStates keys for categories that no longer exist in
    // the DOM (e.g. after a category was renamed in config.php). Prevents
    // stale boolean state from accumulating in localStorage forever.
    const liveIds = new Set();
    categoryHeaders.forEach(h => {
        const id = h.getAttribute('data-category-id');
        if (id) liveIds.add(id);
    });
    let prunedAny = false;
    Object.keys(state.categoryStates).forEach(id => {
        if (!liveIds.has(id)) {
            delete state.categoryStates[id];
            prunedAny = true;
        }
    });
    if (prunedAny) saveState();

    // Load saved states
    categoryHeaders.forEach(header => {
        const categoryId = header.getAttribute('data-category-id');
        const content = document.querySelector(`.category-content[data-category-id="${CSS.escape(categoryId)}"]`);

        if (!content) return;

        // Apply saved state (default: open). Use Object.hasOwn (with a
        // polyfill-like fallback for older browsers) in case a corrupted
        // localStorage value shadowed the `hasOwnProperty` prototype
        // method on the parsed object.
        const hasOwn = Object.hasOwn || ((o, k) => Object.prototype.hasOwnProperty.call(o, k));
        const isOpen = hasOwn(state.categoryStates, categoryId)
            ? state.categoryStates[categoryId]
            : true;

        if (!isOpen) {
            content.classList.add('collapsed');
            header.classList.add('collapsed');
        }
        header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

        // Add click + keyboard handlers (role="button" divs need explicit
        // Enter/Space handling to stay reachable for keyboard users).
        header.addEventListener('click', () => toggleCategory(categoryId));
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                // Ignore OS key auto-repeat — holding Space would otherwise
                // rapid-toggle the category open/closed.
                if (e.repeat) return;
                e.preventDefault();
                toggleCategory(categoryId);
            }
        });
    });
}

function toggleCategory(categoryId) {
    const header = document.querySelector(`.category-header[data-category-id="${CSS.escape(categoryId)}"]`);
    const content = document.querySelector(`.category-content[data-category-id="${CSS.escape(categoryId)}"]`);

    if (!header || !content) return;

    const isCollapsed = content.classList.contains('collapsed');

    if (isCollapsed) {
        content.classList.remove('collapsed');
        header.classList.remove('collapsed');
        state.categoryStates[categoryId] = true;
    } else {
        content.classList.add('collapsed');
        header.classList.add('collapsed');
        state.categoryStates[categoryId] = false;
    }
    header.setAttribute('aria-expanded', state.categoryStates[categoryId] ? 'true' : 'false');

    saveState();
}

// === Favorites Management ===
function initFavorites() {
    // Migrate old favorites format to new format (backwards compatibility)
    migrateFavoritesFormat();

    // Render favorites bar
    renderFavorites();

    // Wire up every favorite star with BOTH click and keyboard handlers.
    // The star is an <i role="button" tabindex="0"> (not a real <button>
    // — nested buttons would be invalid HTML inside .trigger-btn), so
    // Enter/Space don't synthesise a click automatically. We dispatch the
    // toggle directly from the keydown handler instead.
    const attachStarHandlers = (star, idAttr, type) => {
        if (!star.hasAttribute('role')) star.setAttribute('role', 'button');
        if (!star.hasAttribute('tabindex')) star.setAttribute('tabindex', '0');

        const fire = (e) => {
            e.stopPropagation();
            const id = star.getAttribute(idAttr);
            if (id) toggleFavorite(id, type);
        };
        star.addEventListener('click', fire);
        star.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fire(e);
            }
        });
    };

    document.querySelectorAll('.trigger-btn-favorite').forEach(star => {
        attachStarHandlers(star, 'data-webhook-id', 'webhook');
    });
    document.querySelectorAll('.link-btn-favorite').forEach(star => {
        attachStarHandlers(star, 'data-link-id', 'link');
    });

    // Update star states
    updateFavoriteStars();
}

function migrateFavoritesFormat() {
    if (!Array.isArray(state.favorites)) {
        state.favorites = [];
        saveState();
        return;
    }
    // Check if favorites are in old format (array of strings)
    if (state.favorites.length > 0 && typeof state.favorites[0] === 'string') {
        state.favorites = state.favorites.map(id => ({
            id: id,
            type: 'webhook'
        }));
        saveState();
    }
}

function toggleFavorite(itemId, type) {
    const index = state.favorites.findIndex(fav => fav.id === itemId && fav.type === type);
    
    if (index > -1) {
        // Remove from favorites
        state.favorites.splice(index, 1);
        showToast('Removed from favorites', 'info');
    } else {
        // Add to favorites (max 10)
        if (state.favorites.length >= MAX_FAVORITES) {
            showToast(`Maximum ${MAX_FAVORITES} favorites reached`, 'warning');
            return;
        }
        state.favorites.push({
            id: itemId,
            type: type
        });
        showToast('Added to favorites', 'success');
    }
    
    saveState();
    renderFavorites();
    updateFavoriteStars();
}

function renderFavorites() {
    const favoritesScroll = document.getElementById('favoritesScroll');
    const favoritesEmpty = document.getElementById('favoritesEmpty');

    if (!favoritesScroll || !favoritesEmpty) return;

    // Prune favorites whose target item no longer exists (e.g. a webhook
    // was removed from config.php). Otherwise the stale entries silently
    // eat into the MAX_FAVORITES budget without being visible to the user.
    const beforeCount = state.favorites.length;
    state.favorites = state.favorites.filter(fav => {
        if (!fav || typeof fav.id !== 'string') return false;
        if (fav.type === 'webhook') {
            return !!document.querySelector(`.trigger-btn[data-webhook-id="${CSS.escape(fav.id)}"]`);
        }
        if (fav.type === 'link') {
            return !!document.querySelector(`.custom-link-btn[data-link-id="${CSS.escape(fav.id)}"]`);
        }
        return false;
    });
    if (state.favorites.length !== beforeCount) {
        saveState();
    }

    if (state.favorites.length === 0) {
        favoritesEmpty.style.display = 'block';
        // Remove all favorite buttons
        const existingBtns = favoritesScroll.querySelectorAll('.favorite-btn, .favorite-link-btn');
        existingBtns.forEach(btn => btn.remove());
        return;
    }
    
    favoritesEmpty.style.display = 'none';
    
    // Remove all existing favorite buttons first
    const existingBtns = favoritesScroll.querySelectorAll('.favorite-btn, .favorite-link-btn');
    existingBtns.forEach(btn => btn.remove());
    
    // Add all favorite buttons fresh. CSS.escape on selector values keeps
    // this consistent with the prune filter above — otherwise a legacy
    // itemId with special characters would pass the prune (which escapes)
    // but silently fail to render (which wouldn't).
    state.favorites.forEach((favorite, index) => {
        const itemId = favorite.id;
        const type = favorite.type;
        const escapedId = CSS.escape(itemId);

        if (type === 'webhook') {
            const button = document.querySelector(`.trigger-btn[data-webhook-id="${escapedId}"]`);
            if (!button) return;

            const name = button.getAttribute('data-webhook-name');
            const category = button.getAttribute('data-category');
            const favoriteBtn = createFavoriteButton(itemId, name, index + 1, type, null, null, category);
            favoritesScroll.appendChild(favoriteBtn);
        } else if (type === 'link') {
            const button = document.querySelector(`.custom-link-btn[data-link-id="${escapedId}"]`);
            if (!button) return;

            const name = button.getAttribute('data-link-name');
            const url = button.getAttribute('data-link-url');
            const category = button.getAttribute('data-category');
            const favicon = button.querySelector('.link-btn-favicon');
            const faviconSrc = favicon ? favicon.src : null;

            const favoriteBtn = createFavoriteButton(itemId, name, index + 1, type, url, faviconSrc, category);
            favoritesScroll.appendChild(favoriteBtn);
        }
    });
}

function createFavoriteButton(itemId, name, position, type, url = null, faviconSrc = null, category = null) {
    const btn = document.createElement('button');

    const buildLabel = (labelText, badgeText) => {
        const span = document.createElement('span');
        if (badgeText) {
            const badge = document.createElement('span');
            badge.className = 'favorite-btn-inline-badge';
            badge.textContent = badgeText;
            span.appendChild(badge);
        }
        span.appendChild(document.createTextNode(labelText));
        return span;
    };

    btn.type = 'button';

    if (type === 'webhook') {
        btn.className = 'favorite-btn';
        btn.setAttribute('data-webhook-id', itemId);
        btn.setAttribute('data-type', 'webhook');

        const icon = document.createElement('i');
        icon.className = 'bx bx-bolt favorite-btn-icon';
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        btn.appendChild(buildLabel(name, category));

        btn.addEventListener('click', () => {
            const originalBtn = document.querySelector(`.trigger-btn[data-webhook-id="${CSS.escape(itemId)}"]`);
            if (originalBtn) {
                // Trigger the webhook (which will show the confirmation modal)
                triggerWebhook(originalBtn);
            }
        });

        attachFavoriteDragSort(btn);
    } else if (type === 'link') {
        btn.className = 'favorite-link-btn';
        btn.setAttribute('data-link-id', itemId);
        btn.setAttribute('data-type', 'link');
        btn.setAttribute('data-link-url', url);

        if (faviconSrc) {
            const img = document.createElement('img');
            img.alt = '';
            img.className = 'favorite-link-btn-favicon';

            const fallback = document.createElement('i');
            fallback.className = 'bx bx-link-alt favorite-link-btn-icon';
            fallback.style.display = 'none';
            fallback.setAttribute('aria-hidden', 'true');

            // Close over `img` and `fallback` instead of relying on
            // `this.nextElementSibling` — the latter is null if the error
            // fires synchronously from `img.src = ...` (cached 404) before
            // the fallback has been appended, leaving the button iconless.
            const handleFaviconError = () => {
                img.style.display = 'none';
                fallback.style.display = 'inline-block';
            };
            img.onerror = handleFaviconError;
            img.src = faviconSrc;
            btn.appendChild(img);
            btn.appendChild(fallback);

            // Cached 404 can also complete before onerror fires (browser
            // fires it on the next tick but marks complete=true immediately).
            if (img.complete && img.naturalWidth === 0) {
                handleFaviconError();
            }
        } else {
            const icon = document.createElement('i');
            icon.className = 'bx bx-link-alt favorite-link-btn-icon';
            icon.setAttribute('aria-hidden', 'true');
            btn.appendChild(icon);
        }

        btn.appendChild(buildLabel(name, category));

        btn.addEventListener('click', () => {
            if (!isSafeLinkUrl(url)) {
                showToast(`✗ Invalid or unsafe link URL`, 'error');
                return;
            }
            openLinkSafely(url, name);
        });

        attachFavoriteDragSort(btn);
    }

    return btn;
}

/**
 * Attach HTML5 drag-and-drop handlers to a favorites-bar button so the
 * user can reorder the Quick Actions tray. Operates on state.favorites
 * (array order = display order), persists, and re-renders.
 */
function attachFavoriteDragSort(btn) {
    btn.setAttribute('draggable', 'true');

    btn.addEventListener('dragstart', (e) => {
        btn.classList.add('dragging');
        try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'tf-fav-reorder');
        } catch (err) { /* some platforms restrict drag metadata */ }
    });

    btn.addEventListener('dragend', () => {
        btn.classList.remove('dragging');
        document.querySelectorAll('.favorite-btn.drag-over, .favorite-link-btn.drag-over')
            .forEach((el) => el.classList.remove('drag-over'));
    });

    btn.addEventListener('dragover', (e) => {
        const dragged = document.querySelector('.favorite-btn.dragging, .favorite-link-btn.dragging');
        if (!dragged || dragged === btn) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        btn.classList.add('drag-over');
    });

    btn.addEventListener('dragleave', () => {
        btn.classList.remove('drag-over');
    });

    btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('drag-over');
        const dragged = document.querySelector('.favorite-btn.dragging, .favorite-link-btn.dragging');
        if (!dragged || dragged === btn) return;

        const keyOf = (el) => {
            const type = el.getAttribute('data-type');
            const id = type === 'link'
                ? el.getAttribute('data-link-id')
                : el.getAttribute('data-webhook-id');
            return { id: id, type: type };
        };
        const src = keyOf(dragged);
        const tgt = keyOf(btn);
        const fromIdx = state.favorites.findIndex((f) => f.id === src.id && f.type === src.type);
        const toIdx = state.favorites.findIndex((f) => f.id === tgt.id && f.type === tgt.type);
        if (fromIdx < 0 || toIdx < 0) return;

        const [moved] = state.favorites.splice(fromIdx, 1);
        state.favorites.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, moved);
        saveState();
        renderFavorites();
        updateFavoriteStars();
    });
}

function updateFavoriteStars() {
    const paint = (star, isFavorite) => {
        star.classList.toggle('active', isFavorite);
        star.classList.toggle('bxs-star', isFavorite);
        star.classList.toggle('bx-star', !isFavorite);
        // aria-pressed is the standard way to expose a toggle-button
        // state to screen readers. Pair with the aria-label emitted by
        // PHP for a full "toggle favorite for X, pressed/not pressed"
        // announcement.
        star.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
    };

    document.querySelectorAll('.trigger-btn-favorite').forEach(star => {
        const id = star.getAttribute('data-webhook-id');
        paint(star, state.favorites.some(fav => fav.id === id && fav.type === 'webhook'));
    });
    document.querySelectorAll('.link-btn-favorite').forEach(star => {
        const id = star.getAttribute('data-link-id');
        paint(star, state.favorites.some(fav => fav.id === id && fav.type === 'link'));
    });
}

// === Webhook Buttons ===
function initWebhookButtons() {
    const triggerButtons = document.querySelectorAll('.trigger-btn');

    triggerButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Shift-click toggles the bulk-fire multi-select rather than
            // opening the confirm modal. The floating bar at the bottom
            // offers a single-confirm for firing everything sequentially.
            if (e.shiftKey) {
                e.preventDefault();
                const id = this.getAttribute('data-webhook-id');
                if (id) toggleBulkSelection(this, id);
                return;
            }
            // Ignore if clicking on favorite star
            if (e.target.classList.contains('trigger-btn-favorite')) {
                return;
            }
            triggerWebhook(this);
        });
    });
}

// === Webhook Chains ===
// Client-side sequence runner. The backend knows nothing about chains —
// each step resolves to an existing webhook item and fires through the
// regular trigger.php path (no per-item confirm — the chain confirm is
// sufficient). delayMs is a post-step wait, not a request timeout.
function initChainButtons() {
    document.querySelectorAll('.chain-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            // Shift-click on chains is reserved (bulk-fire doesn't make
            // sense for chains; skip silently).
            if (e.shiftKey) { e.preventDefault(); return; }
            let steps = [];
            try { steps = JSON.parse(btn.getAttribute('data-chain-steps') || '[]'); }
            catch (err) { /* fall through */ }
            const name = btn.getAttribute('data-chain-name') || 'Chain';
            if (!Array.isArray(steps) || steps.length === 0) {
                showToast('Chain "' + name + '" has no steps', 'warning');
                return;
            }
            confirmChainFire(btn, name, steps);
        });
    });
}

function confirmChainFire(chainBtn, chainName, steps) {
    const body = document.createElement('div');
    const intro = document.createElement('p');
    intro.textContent = 'Run the ' + steps.length + '-step chain "' + chainName + '"? Each step fires through the normal webhook endpoint. Steps whose referenced item is missing will be skipped.';
    body.appendChild(intro);
    const ol = document.createElement('ol');
    ol.style.margin = '0';
    ol.style.paddingLeft = '1.25em';
    steps.forEach((step) => {
        const li = document.createElement('li');
        const ref = step && typeof step.ref === 'string' ? step.ref : '';
        const target = ref ? document.querySelector('.trigger-btn[data-webhook-id="' + CSS.escape(ref) + '"]') : null;
        const name = target ? (target.getAttribute('data-webhook-name') || ref) : '(missing: ' + ref + ')';
        const delay = step && step.delayMs > 0 ? ' — then wait ' + Math.round(step.delayMs / 1000 * 10) / 10 + ' s' : '';
        li.textContent = name + delay;
        if (!target) li.style.color = 'var(--error)';
        ol.appendChild(li);
    });
    body.appendChild(ol);

    openModal({
        title: 'Run chain',
        icon: 'bx-git-branch',
        bodyEl: body,
        actions: [
            { label: 'Cancel', variant: 'default', icon: 'bx-x' },
            { label: 'Run chain', variant: 'primary', icon: 'bx-play',
              onClick: () => executeChain(chainBtn, chainName, steps) }
        ]
    });
}

function executeChain(chainBtn, chainName, steps) {
    if (chainBtn.classList.contains('chain-running')) {
        showToast('Chain "' + chainName + '" is already running', 'warning');
        return;
    }
    chainBtn.classList.add('chain-running');
    chainBtn.disabled = true;
    const progressEl = chainBtn.querySelector('.chain-btn-progress');

    let i = 0;
    let fired = 0, skipped = 0;

    const done = () => {
        chainBtn.classList.remove('chain-running');
        chainBtn.disabled = false;
        if (progressEl) {
            // Brief held-full flash before resetting, so users perceive completion.
            progressEl.style.width = '100%';
            setTimeout(() => { progressEl.style.width = '0%'; }, 400);
        }
        const kind = skipped > 0 ? 'warning' : 'success';
        showToast('Chain "' + chainName + '": ' + fired + '/' + steps.length + ' fired'
            + (skipped ? ', ' + skipped + ' skipped' : ''), kind);
    };

    const runStep = () => {
        if (i >= steps.length) { done(); return; }
        const step = steps[i];
        const ref = step && typeof step.ref === 'string' ? step.ref : '';
        const target = ref ? document.querySelector('.trigger-btn[data-webhook-id="' + CSS.escape(ref) + '"]') : null;
        if (progressEl) progressEl.style.width = ((i + 1) / steps.length * 100) + '%';

        const advance = () => {
            i++;
            const wait = step && typeof step.delayMs === 'number' && step.delayMs > 0 ? step.delayMs : 0;
            setTimeout(runStep, wait);
        };

        if (!target) { skipped++; advance(); return; }
        if (isOnCooldown(ref)) { skipped++; advance(); return; }

        const urlProd = target.getAttribute('data-webhook-url-prod');
        const urlTest = target.getAttribute('data-webhook-url-test');
        const url = state.isTestMode ? urlTest : urlProd;
        const name = target.getAttribute('data-webhook-name') || ref;
        if (!url) { skipped++; advance(); return; }

        executeWebhook(target, ref, url, name);
        fired++;
        advance();
    };
    runStep();
}

// === Bulk Fire ===
// In-memory only — Set of webhook ids currently selected. Deliberately
// non-persistent: users don't expect a multi-select to survive a page
// reload, and keeping it ephemeral avoids stale selections pointing to
// removed items.
const bulkSelection = new Set();

function toggleBulkSelection(button, id) {
    if (bulkSelection.has(id)) {
        bulkSelection.delete(id);
        button.classList.remove('bulk-selected');
    } else {
        bulkSelection.add(id);
        button.classList.add('bulk-selected');
    }
    updateBulkFireBar();
}

function clearBulkSelection() {
    bulkSelection.forEach((id) => {
        const btn = document.querySelector('.trigger-btn[data-webhook-id="' + CSS.escape(id) + '"]');
        if (btn) btn.classList.remove('bulk-selected');
    });
    bulkSelection.clear();
    updateBulkFireBar();
}

function updateBulkFireBar() {
    const bar = document.getElementById('bulkFireBar');
    const count = document.getElementById('bulkFireCount');
    if (!bar) return;
    if (bulkSelection.size === 0) {
        bar.classList.remove('active');
        bar.setAttribute('aria-hidden', 'true');
    } else {
        bar.classList.add('active');
        bar.removeAttribute('aria-hidden');
        if (count) count.textContent = String(bulkSelection.size);
    }
}

function initBulkFire() {
    const bar = document.getElementById('bulkFireBar');
    const btnFire = document.getElementById('bulkFireBtn');
    const btnClear = document.getElementById('bulkClearBtn');
    if (!bar) return;

    if (btnFire) btnFire.addEventListener('click', confirmBulkFire);
    if (btnClear) btnClear.addEventListener('click', clearBulkSelection);

    // Escape clears the selection (if nothing modal-ish is open above).
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (bulkSelection.size === 0) return;
        const modalOpen = document.querySelector(
            '.confirmation-modal.active, .settings-modal.active, .generic-modal.active'
        );
        if (modalOpen) return;
        clearBulkSelection();
    });
}

function confirmBulkFire() {
    if (bulkSelection.size === 0) return;
    const items = [];
    bulkSelection.forEach((id) => {
        const btn = document.querySelector('.trigger-btn[data-webhook-id="' + CSS.escape(id) + '"]');
        if (btn) items.push({
            btn: btn,
            id: id,
            name: btn.getAttribute('data-webhook-name') || id
        });
    });
    if (items.length === 0) { clearBulkSelection(); return; }

    const body = document.createElement('div');
    const intro = document.createElement('p');
    intro.textContent = 'Fire ' + items.length + ' webhook' + (items.length === 1 ? '' : 's')
        + ' in sequence? Items currently on cooldown will be skipped.';
    body.appendChild(intro);
    const ul = document.createElement('ul');
    ul.style.margin = '0';
    ul.style.paddingLeft = '1.25em';
    items.forEach((it) => {
        const li = document.createElement('li');
        li.textContent = it.name;
        ul.appendChild(li);
    });
    body.appendChild(ul);

    openModal({
        title: 'Bulk fire (' + items.length + ')',
        icon: 'bx-bolt',
        bodyEl: body,
        actions: [
            { label: 'Cancel', variant: 'default', icon: 'bx-x' },
            { label: 'FIRE ALL', variant: 'primary', icon: 'bxs-fire-alt',
              onClick: () => executeBulkFire(items) }
        ]
    });
}

function executeBulkFire(items) {
    clearBulkSelection();
    let fired = 0, skipped = 0;
    items.forEach((it) => {
        if (isOnCooldown(it.id) || it.btn.classList.contains('loading')) {
            skipped++;
            return;
        }
        const urlProd = it.btn.getAttribute('data-webhook-url-prod');
        const urlTest = it.btn.getAttribute('data-webhook-url-test');
        const url = state.isTestMode ? urlTest : urlProd;
        if (!url) { skipped++; return; }
        // Bypass the single-item confirm modal (we already confirmed all
        // of them above) and go straight to executeWebhook.
        executeWebhook(it.btn, it.id, url, it.name);
        fired++;
    });
    const type = fired > 0 ? 'success' : (skipped > 0 ? 'warning' : 'info');
    showToast('Bulk fire: ' + fired + ' triggered' + (skipped ? ', ' + skipped + ' skipped' : ''), type);
}

// === Link Buttons ===
function initLinkButtons() {
    const linkButtons = document.querySelectorAll('.custom-link-btn');

    linkButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Ignore if clicking on favorite star
            if (e.target.classList.contains('link-btn-favorite')) {
                return;
            }
            openCustomLink(this);
        });
    });

    // Attach favicon error fallback without inline handlers (CSP-safe).
    // Must handle already-errored images too (e.g. bfcache restore).
    document.querySelectorAll('.link-btn-favicon').forEach(img => {
        const handleError = () => {
            img.style.display = 'none';
            if (img.nextElementSibling) {
                img.nextElementSibling.style.display = 'inline-block';
            }
        };
        if (img.complete && img.naturalWidth === 0) {
            handleError();
        } else {
            img.addEventListener('error', handleError, { once: true });
        }
    });
}

// Open a URL in a new tab via a synthetic <a> click. We use this instead
// of `window.open(url, '_blank', 'noopener,noreferrer')` because the HTML
// spec says window.open ALWAYS returns null when the `noopener` feature
// is present — which would make every successful open look like a popup
// block. Anchor elements with `rel="noopener noreferrer"` provide the
// same security guarantees without that false negative.
function openLinkSafely(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`🔗 ${name} opened`, 'info');
}

function openCustomLink(button) {
    const url = button.getAttribute('data-link-url');
    const name = button.getAttribute('data-link-name');

    if (!isSafeLinkUrl(url)) {
        showToast(`✗ Invalid or unsafe link URL`, 'error');
        return;
    }

    // Visual feedback
    button.classList.add('clicked');

    openLinkSafely(url, name);

    // Reset animation
    setTimeout(() => {
        button.classList.remove('clicked');
    }, 300);
}

function triggerWebhook(button) {
    const webhookId = button.getAttribute('data-webhook-id');
    const webhookUrlProd = button.getAttribute('data-webhook-url-prod');
    const webhookUrlTest = button.getAttribute('data-webhook-url-test');
    const webhookUrl = state.isTestMode ? webhookUrlTest : webhookUrlProd;
    const webhookName = button.getAttribute('data-webhook-name');

    // Prevent re-trigger while a request is already in-flight (rapid clicks
    // through favorite buttons can otherwise fire the same webhook twice).
    if (button.classList.contains('loading')) {
        showToast('Already triggering…', 'warning');
        return;
    }

    // Guard against webhooks with no URL configured for the current mode
    // (e.g. test-only or prod-only entries). Without this, the request
    // reaches the server as an empty body and surfaces as a generic error.
    if (!webhookUrl) {
        const mode = state.isTestMode ? 'TEST' : 'PROD';
        showToast(`No ${mode} URL configured for this webhook`, 'warning');
        return;
    }

    // Check cooldown
    if (isOnCooldown(webhookId)) {
        const remaining = getRemainingCooldown(webhookId);
        showToast(`Please wait ${Math.ceil(remaining / 1000)}s`, 'warning');
        return;
    }

    // Per-webhook confirm-skip: data-confirm="false" (from config's
    // 'confirm' => false) fires without the modal. Reserved for low-risk
    // endpoints where the extra click is annoying (e.g. a status ping).
    if (button.dataset.confirm === 'false') {
        executeWebhook(button, webhookId, webhookUrl, webhookName);
        return;
    }

    // Show confirmation modal before triggering
    showConfirmationModal(webhookName, () => {
        // Re-check in case cooldown kicked in between open and confirm
        if (button.classList.contains('loading') || isOnCooldown(webhookId)) {
            return;
        }
        // This callback is executed when user clicks "FIRE!"
        executeWebhook(button, webhookId, webhookUrl, webhookName);
    });
}

function executeWebhook(button, webhookId, webhookUrl, webhookName) {
    // Clear leftover state from a previous flow so the 1s revert gates in
    // handleSuccess/handleError can tell "still mine" from "already moved
    // on". Without this, a re-trigger within the 1s window would still see
    // the old class and its setTimeout would stomp on the new loader icon.
    button.classList.remove('error', 'success');
    const icon = button.querySelector('.trigger-btn-icon');
    // Reset the icon to the canonical bolt class BEFORE capturing
    // `originalIconClass`. Otherwise a re-trigger during the 1s after an
    // error/success would capture the transient bx-alert-circle /
    // bx-check-circle class and revert the icon to the wrong state once
    // the new flow completes.
    if (icon) icon.className = 'bx bx-bolt trigger-btn-icon';
    // Disable button and show loading state
    button.disabled = true;
    button.classList.add('loading');
    const originalIconClass = icon ? icon.className : '';
    if (icon) {
        icon.className = 'bx bx-loader-lines trigger-btn-icon';
    }
    
    // Abort after 40s so the button can't get stuck in loading state on a
    // dropped connection. Server-side cURL caps at 30s + 10s connect, so a
    // real response always arrives well before this.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);
    const startedAt = Date.now();

    fetch('api/trigger.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            webhook_url: webhookUrl
        }),
        signal: controller.signal
    })
    .then(response => response.json().catch(() => ({
        // Non-JSON body (e.g. Apache/PHP error page). Surface the HTTP
        // status so the user gets a readable message instead of a
        // generic "Unexpected token" parse error.
        success: false,
        message: `Server error (HTTP ${response.status})`
    })))
    .then(data => {
        clearTimeout(timeoutId);
        // Remove loading state
        button.classList.remove('loading');
        if (icon) icon.className = originalIconClass;

        const durationMs = Date.now() - startedAt;
        const payload = (data && typeof data === 'object') ? data : {};
        if (payload.success) {
            // Success state
            handleSuccess(button, webhookName, payload, durationMs);
            startCooldown(webhookId, button);
        } else {
            // Error state
            const msg = typeof payload.message === 'string' ? payload.message : 'Unknown error';
            handleError(button, msg, payload, durationMs);
            button.disabled = false;
        }
    })
    .catch(error => {
        clearTimeout(timeoutId);
        // Connection error
        button.classList.remove('loading');
        if (icon) icon.className = originalIconClass;
        const msg = error.name === 'AbortError'
            ? 'Request timed out'
            : 'Connection error: ' + error.message;
        const durationMs = Date.now() - startedAt;
        // No server payload on a network failure — synthesise a minimal
        // one so the history row still records the attempt + duration.
        handleError(button, msg, { http_code: 0, response_body: '', response_headers: {} }, durationMs);
        button.disabled = false;
    });
}

function handleSuccess(button, webhookName, payload, durationMs) {
    // Record stats BEFORE the visual flash so even a very quick re-render
    // sees the updated counters. Guard on webhookId because the legacy
    // DOM structure lets us reach this without one in edge cases.
    const webhookId = button.getAttribute('data-webhook-id');
    if (webhookId) {
        state.lastTriggered[webhookId] = Date.now();
        state.triggerCounts[webhookId] = (state.triggerCounts[webhookId] || 0) + 1;
        saveState();
        updateLastTriggeredFor(button);
        updateTriggerCountFor(button);
    }
    pushHistoryEntry(button, webhookName, 'success', payload, durationMs);

    // Change icon temporarily
    const icon = button.querySelector('.trigger-btn-icon');
    const originalIconClass = icon ? icon.className : '';
    if (icon) icon.className = 'bx bx-check-circle trigger-btn-icon';

    // Add success class for color transition
    button.classList.add('success');

    // Haptic feedback on mobile — short buzz confirms the fire without
    // the user having to look at the screen. Opt-in via settings.
    if (state.settings.haptic && navigator.vibrate) {
        try { navigator.vibrate(40); } catch (e) { /* some browsers throw on gesture-less vibrate */ }
    }

    // Toast — action priority: Undo (if configured) > Details (if the
    // upstream returned something worth inspecting) > none.
    const undoUrl = button.getAttribute('data-undo-url') || '';
    let action = null;
    let toastDuration;
    if (undoUrl && /^https?:\/\//i.test(undoUrl)) {
        action = { label: 'Undo', onClick: () => fireUndo(undoUrl, webhookName) };
        toastDuration = 8000;
    } else if (_responseHasDetails(payload)) {
        action = { label: 'Details', onClick: () => openResponseViewer(webhookName, payload, true) };
    }
    showToast(`✓ ${webhookName} triggered successfully!`, 'success', action, toastDuration);

    // Reset after 1 second. Gate on the class so we don't stomp on the
    // icon if the user triggered another request in the meantime (which
    // would have moved the button out of the `success` state already).
    setTimeout(() => {
        if (!button.classList.contains('success')) return;
        button.classList.remove('success');
        if (icon) icon.className = originalIconClass;
    }, 1000);
}

/**
 * Fire the configured undo_url for a webhook. Uses the same
 * api/trigger.php endpoint — the URL is whitelisted server-side with a
 * minimal item (default payload / POST / application-json) so the undo
 * path doesn't inherit the main fire's overrides.
 */
function fireUndo(undoUrl, webhookName) {
    fetch('api/trigger.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: undoUrl })
    })
    .then(async (r) => {
        let data = {};
        try { data = await r.json(); } catch (e) {}
        if (r.ok && data.success) {
            showToast('↩ Undo fired for ' + webhookName, 'success');
        } else {
            const msg = (data && data.message) ? data.message : ('HTTP ' + r.status);
            showToast('✗ Undo failed: ' + msg, 'error');
        }
    })
    .catch((err) => showToast('✗ Undo request failed: ' + err.message, 'error'));
}

function handleError(button, message, payload, durationMs) {
    // Change icon temporarily
    const icon = button.querySelector('.trigger-btn-icon');
    const originalIconClass = icon ? icon.className : '';
    if (icon) icon.className = 'bx bx-alert-circle trigger-btn-icon';

    // Add error class for shake animation
    button.classList.add('error');

    // Details link when the upstream returned a body or a meaningful
    // HTTP code — typically carries the real failure reason that the
    // top-line toast message can't fit.
    const webhookName = button.getAttribute('data-webhook-name') || 'Webhook';
    const action = _responseHasDetails(payload)
        ? { label: 'Details', onClick: () => openResponseViewer(webhookName, payload, false) }
        : null;
    showToast(`✗ Error: ${message}`, 'error', action);

    pushHistoryEntry(button, webhookName, 'error', payload, durationMs, message);

    // Reset after 1 second. Same rationale as handleSuccess: bail out if
    // the button has already moved on to another state.
    setTimeout(() => {
        if (!button.classList.contains('error')) return;
        button.classList.remove('error');
        if (icon) icon.className = originalIconClass;
    }, 1000);
}

// === Cooldown System ===
function isOnCooldown(webhookId) {
    if (!state.cooldowns[webhookId]) return false;
    return Date.now() < state.cooldowns[webhookId];
}

function getRemainingCooldown(webhookId) {
    if (!isOnCooldown(webhookId)) return 0;
    return state.cooldowns[webhookId] - Date.now();
}

/**
 * Resolve the cooldown duration for a given button. Per-webhook override
 * via data-cooldown (emitted from config's 'cooldown' field) wins; falls
 * back to the global COOLDOWN_DURATION. A value of 0 means "no cooldown
 * at all" for this button.
 */
function resolveCooldownDuration(button) {
    const raw = button ? button.dataset.cooldown : undefined;
    if (raw === undefined || raw === '') return COOLDOWN_DURATION;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) return COOLDOWN_DURATION;
    return n;
}

function startCooldown(webhookId, button) {
    const duration = resolveCooldownDuration(button);
    // 0 = explicit opt-out. Still tidy any stale cooldown entry so the
    // button isn't wrongly marked disabled on the next page load.
    if (duration === 0) {
        if (state.cooldowns[webhookId] !== undefined) {
            delete state.cooldowns[webhookId];
            saveState();
        }
        return;
    }
    const endTime = Date.now() + duration;
    state.cooldowns[webhookId] = endTime;
    saveState();

    button.classList.add('cooldown');
    const cooldownBar = button.querySelector('.trigger-btn-cooldown');
    const textSpan = button.querySelector('.trigger-btn-text');
    // Defensive: if the button markup ever loses one of these child
    // elements we still want the cooldown state to persist correctly,
    // even if the visual bar can't render. Skip display update rather
    // than throwing a TypeError on textSpan.textContent.
    if (!cooldownBar || !textSpan) return;
    const originalText = textSpan.textContent;

    updateCooldownDisplay(webhookId, button, cooldownBar, textSpan, originalText, duration);
}

/**
 * Screen-reader-friendly cooldown announcements. The visible cooldown
 * bar updates at rAF frequency (60 Hz) which would carpet-bomb AT
 * users if we piped the textual countdown into aria-live. Instead we
 * keep a parallel sr-only live-region and only rewrite it when the
 * whole-seconds value changes.
 */
const _cooldownAnnouncedAt = {};
function announceCooldown(button, webhookId, secondsLeft) {
    if (_cooldownAnnouncedAt[webhookId] === secondsLeft) return;
    _cooldownAnnouncedAt[webhookId] = secondsLeft;

    let live = button.querySelector('.trigger-btn-sr-live');
    if (!live) {
        live = document.createElement('span');
        live.className = 'sr-only trigger-btn-sr-live';
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('aria-atomic', 'true');
        button.appendChild(live);
    }
    const name = button.getAttribute('data-webhook-name') || 'Webhook';
    live.textContent = secondsLeft > 0
        ? name + ' ready in ' + secondsLeft + ' seconds'
        : name + ' ready';
}

function updateCooldownDisplay(webhookId, button, cooldownBar, textSpan, originalText, duration) {
    // Bail if button was removed from DOM (e.g. after a re-render)
    if (!button.isConnected) {
        return;
    }

    if (!isOnCooldown(webhookId)) {
        button.classList.remove('cooldown');
        button.disabled = false;
        cooldownBar.style.width = '0%';
        textSpan.textContent = originalText;

        // Clean up the expired entry instead of leaving it in localStorage
        // until the next page load — keeps the state store tidy.
        if (state.cooldowns[webhookId] !== undefined) {
            delete state.cooldowns[webhookId];
            saveState();
        }

        // Announce readiness once to screen readers, then forget so a
        // future cooldown starts fresh.
        announceCooldown(button, webhookId, 0);
        delete _cooldownAnnouncedAt[webhookId];

        // Brief glow animation when ready
        button.style.boxShadow = 'var(--glow-primary-strong)';
        setTimeout(() => {
            button.style.boxShadow = '';
        }, 500);

        return;
    }

    const remaining = getRemainingCooldown(webhookId);
    const secondsLeft = Math.ceil(remaining / 1000);
    announceCooldown(button, webhookId, secondsLeft);
    // Use the per-button duration (captured at startCooldown / restoreCooldowns
    // time) so custom long cooldowns show a sensibly-proportioned progress
    // bar instead of overflowing the default 10 s grid.
    const effective = duration && duration > 0 ? duration : COOLDOWN_DURATION;
    const progress = ((effective - remaining) / effective) * 100;

    textSpan.textContent = `Ready in ${secondsLeft}s...`;
    cooldownBar.style.width = `${progress}%`;

    requestAnimationFrame(() => {
        updateCooldownDisplay(webhookId, button, cooldownBar, textSpan, originalText, duration);
    });
}

function restoreCooldowns() {
    Object.keys(state.cooldowns).forEach(webhookId => {
        if (isOnCooldown(webhookId)) {
            // Scope selector to .trigger-btn so we never match favorite buttons
            // in the quick-actions bar, which share the same data-webhook-id.
            const button = document.querySelector(`.trigger-btn[data-webhook-id="${CSS.escape(webhookId)}"]`);
            if (!button) {
                // Orphan cooldown for a webhook that no longer exists in
                // config — drop it so it doesn't linger in state forever.
                delete state.cooldowns[webhookId];
                return;
            }

            const cooldownBar = button.querySelector('.trigger-btn-cooldown');
            const textSpan = button.querySelector('.trigger-btn-text');
            if (!cooldownBar || !textSpan) return;

            button.classList.add('cooldown');
            button.disabled = true;
            const originalText = button.getAttribute('data-webhook-name');
            // Recover the duration from the button's data-* attribute so
            // the progress bar fills smoothly even after a page reload.
            const duration = resolveCooldownDuration(button);
            updateCooldownDisplay(webhookId, button, cooldownBar, textSpan, originalText, duration);
        } else {
            delete state.cooldowns[webhookId];
        }
    });
    saveState();
}

// === Toast Notifications ===
/**
 * @param {string} message
 * @param {string} [type='info']
 * @param {{label: string, onClick: function}} [action] Optional inline
 *        action button (e.g. "Details" link on the response viewer).
 *        Clicking runs onClick() then closes the toast.
 */
function showToast(message, type = 'info', action = null, duration) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Cap concurrent toasts. Without this, a spam-clicked favorite or a
    // cascade of errors can stack unbounded DOM nodes in the container.
    // Drop the oldest toast(s) so the most recent feedback stays visible.
    const existingToasts = container.querySelectorAll('.toast');
    for (let i = 0; i <= existingToasts.length - MAX_TOASTS; i++) {
        existingToasts[i].remove();
    }

    const icons = {
        success: 'bx-check-circle',
        error: 'bx-alert-circle',
        warning: 'bx-alert-triangle',
        info: 'bx-info-circle'
    };
    const iconClass = icons[type] || icons.info;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconEl = document.createElement('i');
    iconEl.className = `bx ${iconClass} toast-icon`;
    iconEl.setAttribute('aria-hidden', 'true');

    const content = document.createElement('div');
    content.className = 'toast-content';
    const msgEl = document.createElement('div');
    msgEl.className = 'toast-message';
    msgEl.textContent = message;
    content.appendChild(msgEl);

    if (action && typeof action.onClick === 'function') {
        const actBtn = document.createElement('button');
        actBtn.type = 'button';
        actBtn.className = 'toast-action';
        actBtn.textContent = String(action.label || 'Details');
        actBtn.addEventListener('click', () => {
            try { action.onClick(); } catch (e) { console.error(e); }
            closeToast(toast);
        });
        content.appendChild(actBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close notification');
    const closeIcon = document.createElement('i');
    closeIcon.className = 'bx bx-x';
    closeIcon.setAttribute('aria-hidden', 'true');
    closeBtn.appendChild(closeIcon);

    toast.appendChild(iconEl);
    toast.appendChild(content);
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    closeBtn.addEventListener('click', () => {
        closeToast(toast);
    });

    // Auto-dismiss; per-toast override via `duration` (e.g. the Undo
    // window wants longer than the default to give the user time to
    // react).
    const ms = typeof duration === 'number' && duration > 0 ? duration : TOAST_DURATION;
    setTimeout(() => {
        closeToast(toast);
    }, ms);
}

function closeToast(toast) {
    // Idempotent: the user can click close and the auto-dismiss timer
    // can also fire on the same toast — without this guard we'd queue
    // two removals and potentially replay the slide-out animation.
    if (toast.classList.contains('closing')) return;
    toast.classList.add('closing');
    setTimeout(() => {
        toast.remove();
    }, 300);
}

// === Mode Toggle (TEST/PROD) ===
function initModeToggle() {
    const toggleCheckbox = document.getElementById('modeToggleCheckbox');
    const testModeBanner = document.getElementById('testModeBanner');
    
    if (!toggleCheckbox || !testModeBanner) return;
    
    // Set initial state
    toggleCheckbox.checked = state.isTestMode;
    updateModeUI();
    
    // Add change event listener
    toggleCheckbox.addEventListener('change', (e) => {
        state.isTestMode = e.target.checked;
        saveState();
        updateModeUI();
        
        const mode = state.isTestMode ? 'TEST' : 'PROD';
        showToast(`Switched to ${mode} mode`, 'info');
    });
}

function updateModeUI() {
    const testModeBanner = document.getElementById('testModeBanner');
    if (!testModeBanner) return;

    // Update banner visibility and body class
    if (state.isTestMode) {
        testModeBanner.classList.remove('hidden');
        document.body.classList.add('test-mode');
    } else {
        testModeBanner.classList.add('hidden');
        document.body.classList.remove('test-mode');
    }

    // Reflect the mode in the tab title so users flipping between tabs
    // can see at a glance that they're in test mode before firing.
    document.title = state.isTestMode ? 'TriggerForge (TEST)' : 'TriggerForge';
}

// === Confirmation Modal ===
function initConfirmationModal() {
    const modal = document.getElementById('confirmationModal');
    const backdrop = document.getElementById('confirmationModalBackdrop');
    const btnCancel = document.getElementById('confirmationModalBtnCancel');
    const btnConfirm = document.getElementById('confirmationModalBtnConfirm');
    
    if (!modal || !backdrop || !btnCancel || !btnConfirm) {
        console.warn('Confirmation modal elements not found');
        return;
    }
    
    // Cancel button
    btnCancel.addEventListener('click', hideConfirmationModal);
    
    // Backdrop click
    backdrop.addEventListener('click', hideConfirmationModal);
    
    // ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            hideConfirmationModal();
        }
    });
    
    // Confirm button will be handled dynamically with callback
}

let confirmationModalReturnFocus = null;

function showConfirmationModal(webhookName, callback) {
    const modal = document.getElementById('confirmationModal');
    const backdrop = document.getElementById('confirmationModalBackdrop');
    const webhookNameElement = document.getElementById('confirmationModalWebhookName');
    const btnConfirm = document.getElementById('confirmationModalBtnConfirm');

    if (!modal || !backdrop || !webhookNameElement || !btnConfirm) {
        // If the modal HTML is broken, refuse to fire — the user has no
        // way to confirm, and firing a webhook silently on click could
        // trigger production workflows the user didn't intend.
        console.warn('Confirmation modal elements not found');
        showToast('Confirmation dialog unavailable — cannot fire webhook', 'error');
        return;
    }

    // Remember what was focused so we can restore it when the modal closes
    // (keyboard users otherwise lose their place when the modal dismisses).
    confirmationModalReturnFocus = document.activeElement;
    
    // Set webhook name
    webhookNameElement.textContent = webhookName;

    // Remove old event listeners by cloning the button
    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

    // Add new event listener — { once: true } prevents rapid double-click from
    // firing the callback twice during the modal's close transition.
    newBtnConfirm.addEventListener('click', () => {
        hideConfirmationModal();
        if (callback) callback();
    }, { once: true });

    // Show modal with animation. aria-hidden + inert are removed in sync
    // with the visible state — the dialog starts aria-hidden + inert in
    // HTML so AT don't announce it on page load and keyboard users can't
    // Tab into the invisible confirm/cancel buttons while opacity is 0.
    backdrop.classList.add('active');
    modal.classList.add('active');
    modal.removeAttribute('aria-hidden');
    backdrop.removeAttribute('aria-hidden');
    modal.removeAttribute('inert');
    backdrop.removeAttribute('inert');

    // Trap focus inside the modal by marking the rest of the page inert.
    // Without this, Tab can move focus to the trigger buttons behind the
    // modal — breaking the aria-modal="true" contract.
    const container = document.querySelector('.container');
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (container) container.setAttribute('inert', '');
    if (scrollBtn) scrollBtn.setAttribute('inert', '');

    // Lock body scroll so the page behind the modal doesn't drift around
    // while the user is deciding. Restored in hideConfirmationModal.
    document.body.style.overflow = 'hidden';

    // Focus on confirm button for accessibility. Gate on `.active` so that
    // if the user dismisses the modal within the 100ms transition window
    // (Escape / backdrop click), we don't yank focus away from the
    // restoration target that hideConfirmationModal just set.
    setTimeout(() => {
        if (modal.classList.contains('active')) {
            newBtnConfirm.focus();
        }
    }, 100);
}

function hideConfirmationModal() {
    const modal = document.getElementById('confirmationModal');
    const backdrop = document.getElementById('confirmationModalBackdrop');

    if (!modal || !backdrop) return;

    modal.classList.remove('active');
    backdrop.classList.remove('active');

    // Lift the focus-trap inert from the rest of the page FIRST so the
    // restore target below is actually focusable again.
    const container = document.querySelector('.container');
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (container) container.removeAttribute('inert');
    if (scrollBtn) scrollBtn.removeAttribute('inert');

    // Restore focus BEFORE marking the modal aria-hidden / inert. ARIA
    // forbids aria-hidden on an element that contains the currently focused
    // element, and applying inert to the modal would otherwise blur focus
    // to <body>, defeating the focus-restoration contract.
    if (confirmationModalReturnFocus && typeof confirmationModalReturnFocus.focus === 'function') {
        try { confirmationModalReturnFocus.focus(); } catch (e) { /* detached node */ }
    }
    confirmationModalReturnFocus = null;

    modal.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    backdrop.setAttribute('inert', '');

    // Restore body scroll that was locked on show.
    document.body.style.overflow = '';
}

// === Scroll to Top Button ===
function initScrollToTop() {
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');

    if (!scrollToTopBtn) return;

    // Throttle scroll handler via rAF — updates visibility during continuous scrolling
    let ticking = false;
    const updateVisibility = () => {
        if (window.scrollY > 300) {
            scrollToTopBtn.classList.add('visible');
        } else {
            scrollToTopBtn.classList.remove('visible');
        }
        ticking = false;
    };
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateVisibility);
            ticking = true;
        }
    }, { passive: true });
    // Set initial state in case page is already scrolled (e.g. on reload)
    updateVisibility();
    
    // Scroll to top when clicked. Respect prefers-reduced-motion — JS
    // scrollTo({behavior:'smooth'}) is NOT covered by the CSS
    // `scroll-behavior: auto` override in the reduced-motion media query,
    // so users who opted out of motion would still get a smooth scroll
    // here unless we branch explicitly.
    scrollToTopBtn.addEventListener('click', () => {
        const prefersReducedMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({
            top: 0,
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });
        
        // Brief haptic feedback via animation
        scrollToTopBtn.style.transform = 'translateX(-50%) scale(0.9)';
        setTimeout(() => {
            scrollToTopBtn.style.transform = '';
        }, 150);
    });
}

// === Search / Filter ===
function initSearch() {
    const searchBar = document.getElementById('searchBar');
    const input = document.getElementById('triggerSearch');
    const clearBtn = document.getElementById('searchClearBtn');
    if (!searchBar || !input) return;

    // Hide the search bar if there are no items to search. One-line no-op
    // UI takes up layout space and draws attention away from the empty
    // state; suppress it until at least one button exists.
    const buttons = document.querySelectorAll('.trigger-btn, .custom-link-btn');
    if (buttons.length === 0) {
        searchBar.hidden = true;
        return;
    }

    const applyFilter = (raw) => {
        const q = String(raw || '').toLowerCase().trim();
        const all = document.querySelectorAll('.trigger-btn, .custom-link-btn');

        all.forEach(btn => {
            if (q === '') {
                btn.hidden = false;
                return;
            }
            // Collect searchable text from the DOM so we don't need a
            // parallel JS-side index. Name > category > description (title).
            const name = (btn.getAttribute('data-webhook-name') ||
                          btn.getAttribute('data-link-name') || '').toLowerCase();
            const category = (btn.getAttribute('data-category') || '').toLowerCase();
            const desc = (btn.getAttribute('title') || '').toLowerCase();
            btn.hidden = !(name.includes(q) || category.includes(q) || desc.includes(q));
        });

        // Hide whole category sections whose items all got filtered out.
        // When q is empty, always re-show so an earlier hidden state
        // doesn't stick around.
        document.querySelectorAll('.category-section').forEach(section => {
            if (q === '') {
                section.hidden = false;
                return;
            }
            const visible = section.querySelector(
                '.trigger-btn:not([hidden]), .custom-link-btn:not([hidden])'
            );
            section.hidden = !visible;
        });

        if (clearBtn) clearBtn.hidden = q === '';
    };

    input.addEventListener('input', (e) => applyFilter(e.target.value));

    // Escape inside the input clears the query (but doesn't blur).
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            if (input.value !== '') {
                input.value = '';
                applyFilter('');
            } else {
                input.blur();
            }
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            applyFilter('');
            input.focus();
        });
    }

    // Global shortcut: `/` or Ctrl/Cmd+K focuses the search input,
    // unless the user is already typing somewhere (input/textarea/select
    // or a contenteditable element).
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        const target = document.activeElement;
        const inField = target && (
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
            target.isContentEditable
        );
        const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
        const isCtrlK = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey;
        if ((isSlash && !inField) || isCtrlK) {
            e.preventDefault();
            input.focus();
            input.select();
        }
    });
}

// === Drag-and-Drop Item Sorting ===
// HTML5 native drag-and-drop. Works on desktop; touch devices don't
// dispatch drag events from native drag, so reorder is currently a
// pointer-only feature. Per-user order is stored in state.itemOrder
// (localStorage) — the config.php itself isn't modified, so shared
// config stays the operator's source of truth.
//
// Visual reorder is done via CSS `order`, not DOM moves. That way the
// PHP-rendered HTML stays authoritative for IDs / attributes and we
// only paint on top of it.
function initDragSort() {
    let dragged = null;
    let dragCategory = null;

    document.querySelectorAll('.trigger-btn, .custom-link-btn, .chain-btn').forEach((btn) => {
        btn.addEventListener('dragstart', (e) => {
            dragged = btn;
            const section = btn.closest('.category-section');
            const header = section ? section.querySelector('.category-header') : null;
            dragCategory = header ? header.getAttribute('data-category-id') : null;
            btn.classList.add('dragging');
            try {
                e.dataTransfer.effectAllowed = 'move';
                // Firefox requires some dataTransfer payload to enable drag.
                e.dataTransfer.setData('text/plain', 'tf-reorder');
            } catch (err) { /* some browsers restrict drag metadata on cross-origin */ }
        });

        btn.addEventListener('dragend', () => {
            if (dragged) dragged.classList.remove('dragging');
            document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
            dragged = null;
            dragCategory = null;
        });

        btn.addEventListener('dragover', (e) => {
            if (!dragged || dragged === btn) return;
            const section = btn.closest('.category-section');
            const header = section ? section.querySelector('.category-header') : null;
            const targetCat = header ? header.getAttribute('data-category-id') : null;
            if (targetCat !== dragCategory) return; // only within the same category
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            btn.classList.add('drag-over');
        });

        btn.addEventListener('dragleave', () => {
            btn.classList.remove('drag-over');
        });

        btn.addEventListener('drop', (e) => {
            e.preventDefault();
            btn.classList.remove('drag-over');
            if (!dragged || dragged === btn) return;
            const section = btn.closest('.category-section');
            const header = section ? section.querySelector('.category-header') : null;
            const targetCat = header ? header.getAttribute('data-category-id') : null;
            if (targetCat !== dragCategory) return;

            // Build the current visual order (respects any prior itemOrder).
            const items = Array.from(section.querySelectorAll('.trigger-btn, .custom-link-btn, .chain-btn'));
            items.sort((a, b) => {
                const oa = parseFloat(a.style.order || '9999');
                const ob = parseFloat(b.style.order || '9999');
                if (oa !== ob) return oa - ob;
                return Array.prototype.indexOf.call(a.parentNode.children, a) -
                       Array.prototype.indexOf.call(b.parentNode.children, b);
            });

            const fromIdx = items.indexOf(dragged);
            const toIdx = items.indexOf(btn);
            if (fromIdx < 0 || toIdx < 0) return;
            items.splice(fromIdx, 1);
            // If we were before the target, removing us shifts the target
            // left by one; otherwise insert at target's current index.
            items.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, dragged);

            const newOrder = items.map((b2) =>
                b2.getAttribute('data-webhook-id') || b2.getAttribute('data-link-id') || b2.getAttribute('data-chain-id')
            ).filter(Boolean);
            state.itemOrder[targetCat] = newOrder;
            saveState();
            applyItemOrder();
        });
    });
}

/**
 * Project state.itemOrder onto the DOM via CSS `order`. Unknown items
 * (not in the saved order) are appended after all known ones so new
 * config entries always show up at the end instead of silently hiding.
 */
function applyItemOrder() {
    const store = state.itemOrder || {};
    document.querySelectorAll('.category-section').forEach((section) => {
        const header = section.querySelector('.category-header');
        if (!header) return;
        const categoryId = header.getAttribute('data-category-id');
        const desired = store[categoryId];
        if (!Array.isArray(desired) || desired.length === 0) return;

        const indexMap = {};
        desired.forEach((id, i) => { indexMap[id] = i; });
        let fallback = desired.length;
        section.querySelectorAll('.trigger-btn, .custom-link-btn, .chain-btn').forEach((btn) => {
            const id = btn.getAttribute('data-webhook-id') || btn.getAttribute('data-link-id') || btn.getAttribute('data-chain-id');
            if (!id) return;
            btn.style.order = id in indexMap ? String(indexMap[id]) : String(fallback++);
        });
    });
}

// === Generic Modal ===
// Opens the #genericModal with the given title/icon, body (DOM node,
// HTML string or plain text), a footer with configurable action buttons,
// and an optional onClose callback. Returns {close} so callers can
// programmatically dismiss.
//
// Used for: the response-viewer (2.2), the keyboard cheatsheet (1.2/2.1)
// and any later feature that needs a dialog (history details, import
// preview, etc.). The old showConfirmationModal is kept as-is for the
// fire-confirm flow to keep its blast radius small.
let _genericModalReturnFocus = null;
let _genericModalOnClose = null;

function initGenericModal() {
    const modal = document.getElementById('genericModal');
    const backdrop = document.getElementById('genericModalBackdrop');
    const btnClose = document.getElementById('genericModalBtnClose');
    if (!modal || !backdrop) return;

    backdrop.addEventListener('click', closeGenericModal);
    if (btnClose) btnClose.addEventListener('click', closeGenericModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeGenericModal();
        }
    });
}

function openModal(opts) {
    const o = opts || {};
    const modal = document.getElementById('genericModal');
    const backdrop = document.getElementById('genericModalBackdrop');
    const titleEl = document.getElementById('genericModalTitle');
    const iconEl = document.getElementById('genericModalIcon');
    const bodyEl = document.getElementById('genericModalBody');
    const footerEl = document.getElementById('genericModalFooter');
    if (!modal || !backdrop || !titleEl || !bodyEl || !footerEl) return null;

    // Back-to-back openModal: close the existing one first so focus
    // management and the prior onClose both run.
    if (modal.classList.contains('active')) closeGenericModal();

    titleEl.textContent = String(o.title || '');
    if (iconEl) {
        const safeIcon = typeof o.icon === 'string' && /^bx[a-z]*-[a-z0-9-]+$/.test(o.icon)
            ? o.icon : 'bx-info-circle';
        iconEl.className = 'bx ' + safeIcon + ' generic-modal-icon';
    }

    // Body: prefer DOM node > text > HTML string. bodyHtml assumes the
    // caller has already escaped user-provided content.
    bodyEl.innerHTML = '';
    if (o.bodyEl instanceof Node) {
        bodyEl.appendChild(o.bodyEl);
    } else if (typeof o.bodyText === 'string') {
        bodyEl.textContent = o.bodyText;
    } else if (typeof o.bodyHtml === 'string') {
        bodyEl.innerHTML = o.bodyHtml;
    }

    // Action buttons
    footerEl.innerHTML = '';
    const actions = Array.isArray(o.actions) ? o.actions : [];
    actions.forEach(a => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const variant = a && typeof a.variant === 'string' ? a.variant : 'default';
        btn.className = 'generic-modal-btn generic-modal-btn-' + variant;
        if (a && typeof a.icon === 'string' && /^bx[a-z]*-[a-z0-9-]+$/.test(a.icon)) {
            const i = document.createElement('i');
            i.className = 'bx ' + a.icon;
            i.setAttribute('aria-hidden', 'true');
            btn.appendChild(i);
        }
        const label = document.createElement('span');
        label.textContent = a && a.label != null ? String(a.label) : 'OK';
        btn.appendChild(label);
        btn.addEventListener('click', () => {
            let shouldClose = true;
            if (a && typeof a.onClick === 'function') {
                try {
                    const r = a.onClick();
                    if (r === false) shouldClose = false;
                } catch (err) {
                    console.error('[openModal] action onClick threw:', err);
                }
            }
            if (shouldClose) closeGenericModal();
        });
        footerEl.appendChild(btn);
    });

    _genericModalOnClose = typeof o.onClose === 'function' ? o.onClose : null;

    // Show
    _genericModalReturnFocus = document.activeElement;
    backdrop.classList.add('active');
    modal.classList.add('active');
    modal.removeAttribute('aria-hidden');
    backdrop.removeAttribute('aria-hidden');
    modal.removeAttribute('inert');
    backdrop.removeAttribute('inert');
    const container = document.querySelector('.container');
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (container) container.setAttribute('inert', '');
    if (scrollBtn) scrollBtn.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        if (!modal.classList.contains('active')) return;
        const primary = footerEl.querySelector('.generic-modal-btn-primary');
        const first = footerEl.querySelector('.generic-modal-btn');
        const closeBtn = document.getElementById('genericModalBtnClose');
        const target = primary || first || closeBtn;
        if (target && typeof target.focus === 'function') target.focus();
    }, 100);

    return { close: closeGenericModal };
}

function closeGenericModal() {
    const modal = document.getElementById('genericModal');
    const backdrop = document.getElementById('genericModalBackdrop');
    if (!modal || !backdrop) return;
    if (!modal.classList.contains('active')) return;

    modal.classList.remove('active');
    backdrop.classList.remove('active');

    const container = document.querySelector('.container');
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (container) container.removeAttribute('inert');
    if (scrollBtn) scrollBtn.removeAttribute('inert');

    if (_genericModalReturnFocus && typeof _genericModalReturnFocus.focus === 'function') {
        try { _genericModalReturnFocus.focus(); } catch (e) { /* detached */ }
    }
    _genericModalReturnFocus = null;

    modal.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    backdrop.setAttribute('inert', '');
    document.body.style.overflow = '';

    if (_genericModalOnClose) {
        const cb = _genericModalOnClose;
        _genericModalOnClose = null;
        try { cb(); } catch (e) { console.error(e); }
    }
}

/**
 * Render the keyboard-shortcut cheatsheet via the generic modal. Opens
 * when the user presses `?` (registered in initKeyboardShortcuts).
 */
function openCheatsheet() {
    const ul = document.createElement('ul');
    ul.className = 'cheatsheet-list';
    const items = [
        ['/',    'Focus the search bar'],
        ['Ctrl+K', 'Focus the search bar (alternative)'],
        ['1 – 9', 'Fire favorite #N (goes through the confirm flow)'],
        ['t',    'Toggle TEST / PROD mode'],
        ['?',    'Show this cheat sheet'],
        ['Esc',  'Close modal or clear search']
    ];
    items.forEach(([key, desc]) => {
        const li = document.createElement('li');
        const kbd = document.createElement('kbd');
        kbd.className = 'cheatsheet-key';
        kbd.textContent = key;
        const d = document.createElement('span');
        d.className = 'cheatsheet-desc';
        d.textContent = desc;
        li.appendChild(kbd);
        li.appendChild(d);
        ul.appendChild(li);
    });
    openModal({
        title: 'Keyboard Shortcuts',
        icon: 'bx-keyboard',
        bodyEl: ul,
        actions: [{ label: 'Close', variant: 'default', icon: 'bx-x' }]
    });
}

/**
 * Whether the server's response envelope carries data worth opening a
 * details modal for. Prevents the "Details" link from cluttering toasts
 * when the upstream replied with an empty body (common on webhook
 * endpoints that ack with HTTP 204).
 */
function _responseHasDetails(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (typeof payload.response_body === 'string' && payload.response_body.length > 0) return true;
    if (payload.response_headers && typeof payload.response_headers === 'object'
        && Object.keys(payload.response_headers).length > 0) return true;
    return false;
}

/**
 * Render the response viewer modal for a given trigger payload.
 * @param {string} webhookName Display name (used in the modal title).
 * @param {object} payload     Server envelope from api/trigger.php.
 * @param {boolean} success    Whether this was a success path (picks icon).
 */
function openResponseViewer(webhookName, payload, success) {
    const container = document.createElement('div');

    // Top meta row: HTTP code + content-type.
    const meta = document.createElement('div');
    meta.className = 'response-meta';
    if (payload.http_code) {
        const codeSpan = document.createElement('span');
        const strong = document.createElement('strong');
        strong.textContent = 'HTTP';
        codeSpan.appendChild(strong);
        codeSpan.appendChild(document.createTextNode(' ' + payload.http_code));
        meta.appendChild(codeSpan);
    }
    if (payload.response_content_type) {
        const ctSpan = document.createElement('span');
        const strong = document.createElement('strong');
        strong.textContent = 'Content-Type';
        ctSpan.appendChild(strong);
        ctSpan.appendChild(document.createTextNode(' ' + payload.response_content_type));
        meta.appendChild(ctSpan);
    }
    if (typeof payload.response_bytes === 'number') {
        const sizeSpan = document.createElement('span');
        const strong = document.createElement('strong');
        strong.textContent = 'Size';
        sizeSpan.appendChild(strong);
        const suffix = payload.response_truncated ? ' (truncated)' : '';
        sizeSpan.appendChild(document.createTextNode(' ' + payload.response_bytes + ' B' + suffix));
        meta.appendChild(sizeSpan);
    }
    if (meta.children.length) container.appendChild(meta);

    // Response headers — collapsible so the body stays front and centre.
    if (payload.response_headers && typeof payload.response_headers === 'object') {
        const keys = Object.keys(payload.response_headers);
        if (keys.length) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Response headers (' + keys.length + ')';
            details.appendChild(summary);
            const dl = document.createElement('dl');
            keys.forEach(k => {
                const dt = document.createElement('dt');
                dt.textContent = k;
                const dd = document.createElement('dd');
                dd.textContent = String(payload.response_headers[k]);
                dl.appendChild(dt);
                dl.appendChild(dd);
            });
            details.appendChild(dl);
            container.appendChild(details);
        }
    }

    // Body. Pretty-print JSON when the content type says so.
    const pre = document.createElement('pre');
    let body = typeof payload.response_body === 'string' ? payload.response_body : '';
    const ct = String(payload.response_content_type || '').toLowerCase();
    if (body && ct.indexOf('application/json') !== -1) {
        try { body = JSON.stringify(JSON.parse(body), null, 2); } catch (e) { /* keep raw */ }
    }
    pre.textContent = body !== '' ? body : '(empty response body)';
    container.appendChild(pre);

    openModal({
        title: 'Response — ' + webhookName,
        icon: success ? 'bx-check-circle' : 'bx-error-circle',
        bodyEl: container,
        actions: [{ label: 'Close', variant: 'default', icon: 'bx-x' }]
    });
}

// === Trigger History ===
// Newest-first ring buffer of the last MAX_HISTORY fires (success + error),
// persisted in localStorage. Rendered on demand in a slide-in drawer
// that re-uses openModal for per-entry details via the response viewer.
function pushHistoryEntry(button, webhookName, status, payload, durationMs, errorMessage) {
    const p = payload || {};
    const webhookId = button ? button.getAttribute('data-webhook-id') : null;
    const url = button
        ? (state.isTestMode
            ? button.getAttribute('data-webhook-url-test')
            : button.getAttribute('data-webhook-url-prod')) || ''
        : '';
    const entry = {
        id: webhookId || '',
        name: webhookName || 'Webhook',
        url: url,
        ts: Date.now(),
        status: status === 'success' ? 'success' : 'error',
        httpCode: typeof p.http_code === 'number' ? p.http_code : 0,
        durationMs: typeof durationMs === 'number' ? durationMs : 0,
        mode: state.isTestMode ? 'test' : 'prod',
        // Carry the response envelope so the details modal works even
        // when the config item has since been renamed / removed.
        responseBody: typeof p.response_body === 'string' ? p.response_body : '',
        responseHeaders: p.response_headers && typeof p.response_headers === 'object' ? p.response_headers : {},
        responseContentType: typeof p.response_content_type === 'string' ? p.response_content_type : '',
        errorMessage: errorMessage || ''
    };
    state.history.unshift(entry);
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    saveState();
    updateHistoryBadge();
    if (document.getElementById('historyDrawer')?.classList.contains('active')) {
        renderHistoryList();
    }
}

function initHistory() {
    const btn = document.getElementById('historyBtn');
    const drawer = document.getElementById('historyDrawer');
    const btnClose = document.getElementById('historyCloseBtn');
    const btnClear = document.getElementById('historyClearBtn');
    if (!btn || !drawer) return;

    btn.addEventListener('click', toggleHistoryDrawer);
    if (btnClose) btnClose.addEventListener('click', closeHistoryDrawer);
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (state.history.length === 0) return;
            if (!confirm('Clear the trigger history? This only removes local records — fires already completed upstream stay fired.')) return;
            state.history = [];
            saveState();
            renderHistoryList();
            updateHistoryBadge();
            showToast('History cleared', 'info');
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('active')) {
            closeHistoryDrawer();
        }
    });
    updateHistoryBadge();
}

function toggleHistoryDrawer() {
    const drawer = document.getElementById('historyDrawer');
    if (!drawer) return;
    if (drawer.classList.contains('active')) closeHistoryDrawer();
    else openHistoryDrawer();
}

function openHistoryDrawer() {
    const drawer = document.getElementById('historyDrawer');
    if (!drawer) return;
    renderHistoryList();
    drawer.classList.add('active');
    drawer.removeAttribute('aria-hidden');
    drawer.removeAttribute('inert');
    const btn = document.getElementById('historyBtn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeHistoryDrawer() {
    const drawer = document.getElementById('historyDrawer');
    if (!drawer) return;
    drawer.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
    const btn = document.getElementById('historyBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function updateHistoryBadge() {
    const badge = document.getElementById('historyBtnCount');
    if (!badge) return;
    const errCount = state.history.filter(e => e && e.status === 'error').length;
    if (errCount <= 0) {
        badge.hidden = true;
        badge.textContent = '';
    } else {
        badge.hidden = false;
        badge.textContent = errCount > 99 ? '99+' : String(errCount);
    }
}

function renderHistoryList() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = '';
    if (state.history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.innerHTML = '<i class="bx bx-history"></i><p>No trigger history yet.<br>Fire a webhook to see it here.</p>';
        list.appendChild(empty);
        return;
    }
    state.history.forEach((entry, idx) => {
        list.appendChild(renderHistoryRow(entry, idx));
    });
}

function renderHistoryRow(entry, idx) {
    const row = document.createElement('article');
    row.className = 'history-row history-row-' + entry.status;
    row.setAttribute('role', 'listitem');

    // Status dot
    const dot = document.createElement('i');
    dot.className = 'bx history-row-dot ' + (entry.status === 'success' ? 'bx-check-circle' : 'bx-x-circle');
    dot.setAttribute('aria-hidden', 'true');
    row.appendChild(dot);

    // Main block: name + meta
    const main = document.createElement('div');
    main.className = 'history-row-main';
    const nameEl = document.createElement('div');
    nameEl.className = 'history-row-name';
    nameEl.textContent = entry.name;
    main.appendChild(nameEl);

    const meta = document.createElement('div');
    meta.className = 'history-row-meta';
    const when = document.createElement('span');
    when.textContent = formatRelativeTime(entry.ts);
    meta.appendChild(when);
    if (entry.httpCode) {
        const code = document.createElement('span');
        code.textContent = 'HTTP ' + entry.httpCode;
        meta.appendChild(code);
    }
    if (entry.durationMs) {
        const dur = document.createElement('span');
        dur.textContent = entry.durationMs + ' ms';
        meta.appendChild(dur);
    }
    const mode = document.createElement('span');
    mode.className = 'history-row-mode history-row-mode-' + entry.mode;
    mode.textContent = entry.mode.toUpperCase();
    meta.appendChild(mode);
    main.appendChild(meta);

    if (entry.status === 'error' && entry.errorMessage) {
        const err = document.createElement('div');
        err.className = 'history-row-errmsg';
        err.textContent = entry.errorMessage;
        main.appendChild(err);
    }
    row.appendChild(main);

    // Actions column
    const actions = document.createElement('div');
    actions.className = 'history-row-actions';

    // Retry (only if we can still find the original button)
    const targetBtn = entry.id
        ? document.querySelector('.trigger-btn[data-webhook-id="' + CSS.escape(entry.id) + '"]')
        : null;
    if (targetBtn) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'history-action-btn';
        retryBtn.title = 'Retry (fires through the normal confirm/cooldown flow)';
        retryBtn.setAttribute('aria-label', 'Retry ' + entry.name);
        retryBtn.innerHTML = "<i class='bx bx-revision' aria-hidden='true'></i>";
        retryBtn.addEventListener('click', () => {
            closeHistoryDrawer();
            triggerWebhook(targetBtn);
        });
        actions.appendChild(retryBtn);
    } else if (entry.id) {
        const stale = document.createElement('span');
        stale.className = 'history-row-stale';
        stale.title = 'Webhook no longer in config';
        stale.textContent = '—';
        actions.appendChild(stale);
    }

    // Details (response viewer)
    if (_responseHasDetails({ response_body: entry.responseBody, response_headers: entry.responseHeaders })
        || entry.httpCode) {
        const detailsBtn = document.createElement('button');
        detailsBtn.type = 'button';
        detailsBtn.className = 'history-action-btn';
        detailsBtn.title = 'Show response details';
        detailsBtn.setAttribute('aria-label', 'Show details for ' + entry.name);
        detailsBtn.innerHTML = "<i class='bx bx-show' aria-hidden='true'></i>";
        detailsBtn.addEventListener('click', () => {
            openResponseViewer(entry.name, {
                http_code: entry.httpCode,
                response_body: entry.responseBody,
                response_headers: entry.responseHeaders,
                response_content_type: entry.responseContentType,
                success: entry.status === 'success'
            }, entry.status === 'success');
        });
        actions.appendChild(detailsBtn);
    }
    row.appendChild(actions);
    return row;
}

// === Trigger Widgets (Last-Triggered + Counter) ===
// Small meta badges drawn inside each webhook button:
//   • "3 min ago"-style stamp (state.settings.showLastTriggered, default on)
//   • "12×" usage counter       (state.settings.showCounters,      default off)
// Both are opt-outable from the settings modal. Both live under
// aria-hidden so they don't spam screen readers on every update.
function initTriggerWidgets() {
    renderAllLastTriggered();
    renderAllTriggerCounts();
    // Refresh the relative labels every 30 s so "just now" naturally
    // ages into "a minute ago", "3 minutes ago", etc. Counters don't
    // need a timer — they only change via handleSuccess.
    setInterval(renderAllLastTriggered, 30000);
}

function renderAllLastTriggered() {
    const visible = state.settings.showLastTriggered !== false;
    document.querySelectorAll('.trigger-btn').forEach(btn => {
        updateLastTriggeredFor(btn, visible);
    });
}

function updateLastTriggeredFor(btn, forcedVisible) {
    const visible = forcedVisible !== undefined
        ? forcedVisible
        : state.settings.showLastTriggered !== false;
    const id = btn.getAttribute('data-webhook-id');
    const ts = id ? state.lastTriggered[id] : null;
    let el = btn.querySelector('.trigger-btn-last');
    if (!visible || !ts || typeof ts !== 'number') {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = document.createElement('small');
        el.className = 'trigger-btn-last';
        el.setAttribute('aria-hidden', 'true');
        btn.appendChild(el);
    }
    el.textContent = formatRelativeTime(ts);
    el.setAttribute('data-ts', String(ts));
}

function renderAllTriggerCounts() {
    const visible = state.settings.showCounters === true;
    document.querySelectorAll('.trigger-btn').forEach(btn => {
        updateTriggerCountFor(btn, visible);
    });
}

function updateTriggerCountFor(btn, forcedVisible) {
    const visible = forcedVisible !== undefined
        ? forcedVisible
        : state.settings.showCounters === true;
    const id = btn.getAttribute('data-webhook-id');
    const n = id ? state.triggerCounts[id] : 0;
    let el = btn.querySelector('.trigger-btn-count');
    if (!visible || !n) {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = document.createElement('span');
        el.className = 'trigger-btn-count';
        el.setAttribute('aria-hidden', 'true');
        btn.appendChild(el);
    }
    el.textContent = n + '×';
}

/**
 * Format a past timestamp as a human-readable "3 min ago" string.
 * Uses Intl.RelativeTimeFormat when available; falls back to a simple
 * English string on ancient browsers without that API.
 */
function formatRelativeTime(ts) {
    const diffMs = Date.now() - ts;
    if (diffMs < 30000) return 'just now';
    const secs = Math.floor(diffMs / 1000);
    const mins = Math.floor(secs / 60);
    const hrs  = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);

    if (typeof Intl !== 'undefined' && Intl.RelativeTimeFormat) {
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        if (mins < 1)  return rtf.format(-secs, 'second');
        if (mins < 60) return rtf.format(-mins, 'minute');
        if (hrs  < 24) return rtf.format(-hrs, 'hour');
        if (days < 7)  return rtf.format(-days, 'day');
        return rtf.format(-Math.floor(days / 7), 'week');
    }
    if (mins < 1)   return secs + 's ago';
    if (mins < 60)  return mins + ' min ago';
    if (hrs  < 24)  return hrs + 'h ago';
    return days + 'd ago';
}

// === Keyboard Shortcuts ===
// Global keyboard shortcuts. `/` and Ctrl+K are handled in initSearch —
// keep them there. Everything else lives here so the surface area of
// initSearch stays narrow.
//
// Active shortcuts:
//   1..9    Fire favorite N (runs through the normal confirm flow for
//           webhook items; opens links directly).
//   t       Toggle TEST / PROD mode.
//
// Shortcuts are skipped while the user is typing in an input, textarea,
// select, contenteditable or inside a modal with focus (Escape is the
// standard way out).
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const target = document.activeElement;
        const inField = target && (
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
            target.isContentEditable
        );
        if (inField) return;

        // Don't hijack keys while a modal is open — the user is in a
        // blocking dialog and ESC / button clicks are the intended exits.
        const anyModalOpen = document.querySelector(
            '.confirmation-modal.active, .settings-modal.active, .generic-modal.active'
        );
        if (anyModalOpen) return;

        // `?` (typically Shift+/) opens the keyboard cheatsheet. Must come
        // BEFORE the Ctrl-check-free number branch below so the modifier
        // doesn't need to match.
        if (e.key === '?') {
            e.preventDefault();
            openCheatsheet();
            return;
        }

        // Number keys 1-9 → fire favorite at that slot.
        if (e.key >= '1' && e.key <= '9') {
            const idx = parseInt(e.key, 10) - 1;
            const fav = state.favorites[idx];
            if (!fav) return;
            e.preventDefault();
            if (fav.type === 'webhook') {
                const btn = document.querySelector(
                    `.trigger-btn[data-webhook-id="${CSS.escape(fav.id)}"]`
                );
                if (btn) triggerWebhook(btn);
            } else if (fav.type === 'link') {
                const btn = document.querySelector(
                    `.custom-link-btn[data-link-id="${CSS.escape(fav.id)}"]`
                );
                if (btn) openCustomLink(btn);
            }
            return;
        }

        // `t` toggles TEST / PROD mode via the existing checkbox so the
        // change event fires and the toast + persistence run as usual.
        if (e.key === 't' || e.key === 'T') {
            const toggle = document.getElementById('modeToggleCheckbox');
            if (toggle) {
                e.preventDefault();
                toggle.checked = !toggle.checked;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });
}

// === Settings ===
// Accent color palette. Each entry maps the Settings swatch to the three
// --color-primary* custom properties. Keeps the default orange as the
// first entry so older configs and new users land on the ByteSide brand.
const ACCENT_COLORS = {
    orange: { primary: '#FD7D00', hover: '#FFA500', dark: '#d66a00' },
    blue:   { primary: '#3B82F6', hover: '#60A5FA', dark: '#1D4ED8' },
    green:  { primary: '#10B981', hover: '#34D399', dark: '#047857' },
    red:    { primary: '#EF4444', hover: '#F87171', dark: '#B91C1C' },
    violet: { primary: '#8B5CF6', hover: '#A78BFA', dark: '#6D28D9' },
    pink:   { primary: '#EC4899', hover: '#F472B6', dark: '#BE185D' }
};

// applySettings projects state.settings onto the DOM. It's the single source
// of truth for visual preferences: later feature modules (theme switch,
// density, etc.) just read state.settings and call applySettings() again.
// Keep it idempotent — it may be called on boot, after any settings change,
// and (later) after import/restore.
function applySettings() {
    const s = state.settings || DEFAULT_SETTINGS;
    const html = document.documentElement;
    const body = document.body;

    // Theme — resolved 'auto' to dark/light via media query. Inline head
    // script (added in a later phase) pre-sets this to avoid a theme flash;
    // we re-apply here in case settings changed mid-session.
    let effectiveTheme = s.theme;
    if (effectiveTheme === 'auto') {
        effectiveTheme = window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light' : 'dark';
    }
    html.dataset.theme = effectiveTheme;

    // Accent — project onto the --color-primary* trio so the whole
    // design system (buttons, focus rings, glows) retints live without
    // touching component CSS. Unknown values fall back to orange.
    const accent = ACCENT_COLORS[s.accent] || ACCENT_COLORS.orange;
    html.style.setProperty('--color-primary', accent.primary);
    html.style.setProperty('--color-primary-hover', accent.hover);
    html.style.setProperty('--color-primary-dark', accent.dark);
    body.dataset.accent = s.accent;

    // Density / layout / font-scale are data attributes so CSS can
    // target them with [data-density="compact"] etc. once the theme
    // sheet adds those rules in later phases.
    body.dataset.density = s.density;
    body.dataset.layout = s.layout;
    body.dataset.particles = s.particles;
    if (typeof s.fontScale === 'number' && s.fontScale > 0) {
        html.style.setProperty('--font-scale', String(s.fontScale));
    }

    // Meta-widget visibility (last-triggered / trigger counts) is settings-
    // driven. Re-render so toggling takes effect immediately. Safe to call
    // pre-DOM — the inner querySelectorAll just returns an empty NodeList.
    if (typeof renderAllLastTriggered === 'function') renderAllLastTriggered();
    if (typeof renderAllTriggerCounts === 'function') renderAllTriggerCounts();
}

function initSettings() {
    const btnOpen = document.getElementById('settingsBtn');
    const modal = document.getElementById('settingsModal');
    const backdrop = document.getElementById('settingsModalBackdrop');
    const btnClose = document.getElementById('settingsModalBtnClose');
    const btnReset = document.getElementById('settingsResetBtn');

    if (!btnOpen || !modal || !backdrop) {
        // The markup may not be on the page yet if this JS is loaded on a
        // legacy install that hasn't pulled the latest index.php. Fail soft.
        return;
    }

    let returnFocus = null;

    const open = () => {
        returnFocus = document.activeElement;
        backdrop.classList.add('active');
        modal.classList.add('active');
        modal.removeAttribute('aria-hidden');
        backdrop.removeAttribute('aria-hidden');
        modal.removeAttribute('inert');
        backdrop.removeAttribute('inert');
        const container = document.querySelector('.container');
        const scrollBtn = document.getElementById('scrollToTopBtn');
        if (container) container.setAttribute('inert', '');
        if (scrollBtn) scrollBtn.setAttribute('inert', '');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            if (modal.classList.contains('active') && btnClose) {
                btnClose.focus();
            }
        }, 100);
    };

    const close = () => {
        modal.classList.remove('active');
        backdrop.classList.remove('active');
        const container = document.querySelector('.container');
        const scrollBtn = document.getElementById('scrollToTopBtn');
        if (container) container.removeAttribute('inert');
        if (scrollBtn) scrollBtn.removeAttribute('inert');
        if (returnFocus && typeof returnFocus.focus === 'function') {
            try { returnFocus.focus(); } catch (e) { /* detached */ }
        }
        returnFocus = null;
        modal.setAttribute('aria-hidden', 'true');
        backdrop.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');
        backdrop.setAttribute('inert', '');
        document.body.style.overflow = '';
    };

    btnOpen.addEventListener('click', () => { updateSettingsUI(); open(); });
    if (btnClose) btnClose.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            close();
        }
    });

    // Wire up segmented radio-style controls. Each button carries
    // data-setting (top-level key into state.settings) + data-value
    // (the value that button represents). Clicking updates state,
    // persists, re-applies (so the theme switch is instant), and
    // refreshes the aria-checked + .active markers.
    modal.querySelectorAll('[data-setting][data-value]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.setting;
            if (!(key in DEFAULT_SETTINGS)) return;
            const value = _coerceSettingValue(key, btn.dataset.value);
            if (value === null) return;
            state.settings[key] = value;
            saveState();
            applySettings();
            updateSettingsUI();
        });
    });
    // Checkbox-style toggles (boolean settings).
    modal.querySelectorAll('input[type="checkbox"][data-setting]').forEach((input) => {
        input.addEventListener('change', () => {
            const key = input.dataset.setting;
            if (!(key in DEFAULT_SETTINGS)) return;
            if (typeof DEFAULT_SETTINGS[key] !== 'boolean') return;
            state.settings[key] = input.checked;
            saveState();
            applySettings();
            updateSettingsUI();
        });
    });
    updateSettingsUI();

    // Reset-to-defaults button. Does NOT clear favorites/cooldowns/history
    // — only the look-and-feel / behaviour settings. Keeps the blast
    // radius small; a full factory reset can come later in the Data
    // section.
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (!confirm('Reset all settings to their defaults? Your favorites and history will be kept.')) {
                return;
            }
            state.settings = mergeSettings({});
            saveState();
            applySettings();
            updateSettingsUI();
            showToast('Settings reset to defaults', 'info');
        });
    }

    // Install-as-app button. Visible only when `beforeinstallprompt`
    // fired and cached the event; Safari never fires that event so the
    // section stays hidden there.
    const btnInstall = document.getElementById('settingsInstallBtn');
    if (btnInstall) {
        btnInstall.addEventListener('click', () => {
            if (!_deferredInstallPrompt) {
                showToast('Install prompt no longer available — refresh and try again', 'warning');
                return;
            }
            _deferredInstallPrompt.prompt();
            _deferredInstallPrompt.userChoice.then((choice) => {
                _deferredInstallPrompt = null;
                const section = document.getElementById('settingsAppSection');
                if (section) section.hidden = true;
                if (choice && choice.outcome === 'accepted') {
                    showToast('Install accepted', 'success');
                }
            }).catch(() => { /* user dismissed */ });
        });
    }

    // Import: file picker → read JSON → POST to api/import.php → reload
    // on success, show validator errors in a modal on 422.
    const btnImport = document.getElementById('settingsImportBtn');
    const inputImport = document.getElementById('settingsImportFile');
    if (btnImport && inputImport) {
        btnImport.addEventListener('click', () => inputImport.click());
        inputImport.addEventListener('change', () => {
            const file = inputImport.files && inputImport.files[0];
            // Reset now so picking the same file twice in a row still
            // fires the change event.
            inputImport.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onerror = () => showToast('Could not read file', 'error');
            reader.onload = () => {
                let parsed;
                try { parsed = JSON.parse(String(reader.result || '')); }
                catch (err) { showToast('Invalid JSON: ' + err.message, 'error'); return; }
                if (!confirm('Replace current config with the contents of "' + file.name + '"?\n\nThe current config will be backed up automatically.')) {
                    return;
                }
                submitConfigImport(parsed);
            };
            reader.readAsText(file);
        });
    }
}

/**
 * POST the parsed JSON config to api/import.php. On success reload the
 * page so PHP re-renders buttons from the fresh config. On 422 open the
 * validator errors in a modal.
 */
function submitConfigImport(payload) {
    fetch('api/import.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async (response) => {
        let data = {};
        try { data = await response.json(); } catch (e) { /* non-JSON */ }
        if (response.ok && data.success) {
            showToast('Config imported — reloading', 'success');
            setTimeout(() => window.location.reload(), 800);
            return;
        }
        if (response.status === 422 && Array.isArray(data.errors) && data.errors.length) {
            _showImportErrorsModal(data.errors);
            return;
        }
        const msg = (data && data.message) ? data.message : ('HTTP ' + response.status);
        showToast('Import failed: ' + msg, 'error');
    })
    .catch((err) => {
        showToast('Import request failed: ' + err.message, 'error');
    });
}

function _showImportErrorsModal(errors) {
    const ul = document.createElement('ul');
    ul.style.margin = '0';
    ul.style.paddingLeft = '1.25em';
    errors.forEach((msg) => {
        const li = document.createElement('li');
        li.textContent = String(msg);
        li.style.marginBottom = '4px';
        ul.appendChild(li);
    });
    openModal({
        title: 'Import validation failed',
        icon: 'bx-error-circle',
        bodyEl: ul,
        actions: [{ label: 'Close', variant: 'default', icon: 'bx-x' }]
    });
}

/**
 * Sync the Settings modal's UI controls with the current state.settings.
 * Toggles .active + aria-checked on segmented radio buttons. Called on
 * open, after any setting change, and after reset.
 */
function updateSettingsUI() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.querySelectorAll('[data-setting][data-value]').forEach((btn) => {
        const key = btn.dataset.setting;
        if (!(key in DEFAULT_SETTINGS)) return;
        const value = _coerceSettingValue(key, btn.dataset.value);
        const active = state.settings[key] === value;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    modal.querySelectorAll('input[type="checkbox"][data-setting]').forEach((input) => {
        const key = input.dataset.setting;
        if (!(key in DEFAULT_SETTINGS)) return;
        input.checked = !!state.settings[key];
    });
}

/**
 * HTML data-* attributes are always strings; coerce a string back to
 * the type the DEFAULT_SETTINGS entry uses so saved values stay the
 * right type (numbers stay numbers, booleans stay booleans). Returns
 * null for invalid coercions so callers can bail early.
 */
function _coerceSettingValue(key, raw) {
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === 'number') {
        const n = parseFloat(raw);
        return isNaN(n) ? null : n;
    }
    if (typeof def === 'boolean') {
        return raw === 'true' || raw === '1';
    }
    return String(raw);
}

