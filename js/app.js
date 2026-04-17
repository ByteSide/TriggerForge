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
    triggerCounts: {}
};

// === Constants ===
const COOLDOWN_DURATION = 10000; // 10 seconds
const TOAST_DURATION = 4000; // 4 seconds
const MAX_FAVORITES = 10;
const MAX_TOASTS = 5; // cap concurrent toasts to prevent DOM bloat on spam
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
    // Feature flags — each gates a not-yet-stable feature.
    features: {
        history: false,
        chains: false,
        bulkFire: false,
        undo: false,
        pullToRefresh: false,
        offlineQueue: false,
        pushNotifications: false
    }
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
    initSettings();
    initSearch();
    initKeyboardShortcuts();
    initTriggerWidgets();
    initScrollToTop();

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
        ['triggerforge_trigger_counts', state.triggerCounts]
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
    
    // Add click handlers to webhook star icons
    const webhookStars = document.querySelectorAll('.trigger-btn-favorite');
    webhookStars.forEach(star => {
        star.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent button click
            const webhookId = star.getAttribute('data-webhook-id');
            toggleFavorite(webhookId, 'webhook');
        });
    });
    
    // Add click handlers to link star icons
    const linkStars = document.querySelectorAll('.link-btn-favorite');
    linkStars.forEach(star => {
        star.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent button click
            const linkId = star.getAttribute('data-link-id');
            toggleFavorite(linkId, 'link');
        });
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
    }

    return btn;
}

function updateFavoriteStars() {
    // Update webhook stars
    const webhookStars = document.querySelectorAll('.trigger-btn-favorite');
    webhookStars.forEach(star => {
        const webhookId = star.getAttribute('data-webhook-id');
        const isFavorite = state.favorites.some(fav => fav.id === webhookId && fav.type === 'webhook');
        
        if (isFavorite) {
            star.classList.add('active');
            star.classList.remove('bx-star');
            star.classList.add('bxs-star');
        } else {
            star.classList.remove('active');
            star.classList.remove('bxs-star');
            star.classList.add('bx-star');
        }
    });
    
    // Update link stars
    const linkStars = document.querySelectorAll('.link-btn-favorite');
    linkStars.forEach(star => {
        const linkId = star.getAttribute('data-link-id');
        const isFavorite = state.favorites.some(fav => fav.id === linkId && fav.type === 'link');
        
        if (isFavorite) {
            star.classList.add('active');
            star.classList.remove('bx-star');
            star.classList.add('bxs-star');
        } else {
            star.classList.remove('active');
            star.classList.remove('bxs-star');
            star.classList.add('bx-star');
        }
    });
}

// === Webhook Buttons ===
function initWebhookButtons() {
    const triggerButtons = document.querySelectorAll('.trigger-btn');
    
    triggerButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Ignore if clicking on favorite star
            if (e.target.classList.contains('trigger-btn-favorite')) {
                return;
            }
            triggerWebhook(this);
        });
    });
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

        const payload = (data && typeof data === 'object') ? data : {};
        if (payload.success) {
            // Success state
            handleSuccess(button, webhookName);
            startCooldown(webhookId, button);
        } else {
            // Error state
            const msg = typeof payload.message === 'string' ? payload.message : 'Unknown error';
            handleError(button, msg);
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
        handleError(button, msg);
        button.disabled = false;
    });
}

function handleSuccess(button, webhookName) {
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

    // Change icon temporarily
    const icon = button.querySelector('.trigger-btn-icon');
    const originalIconClass = icon ? icon.className : '';
    if (icon) icon.className = 'bx bx-check-circle trigger-btn-icon';

    // Add success class for color transition
    button.classList.add('success');

    // Show toast
    showToast(`✓ ${webhookName} triggered successfully!`, 'success');

    // Reset after 1 second. Gate on the class so we don't stomp on the
    // icon if the user triggered another request in the meantime (which
    // would have moved the button out of the `success` state already).
    setTimeout(() => {
        if (!button.classList.contains('success')) return;
        button.classList.remove('success');
        if (icon) icon.className = originalIconClass;
    }, 1000);
}

function handleError(button, message) {
    // Change icon temporarily
    const icon = button.querySelector('.trigger-btn-icon');
    const originalIconClass = icon ? icon.className : '';
    if (icon) icon.className = 'bx bx-alert-circle trigger-btn-icon';

    // Add error class for shake animation
    button.classList.add('error');

    // Show toast
    showToast(`✗ Error: ${message}`, 'error');

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

function startCooldown(webhookId, button) {
    const endTime = Date.now() + COOLDOWN_DURATION;
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

    updateCooldownDisplay(webhookId, button, cooldownBar, textSpan, originalText);
}

function updateCooldownDisplay(webhookId, button, cooldownBar, textSpan, originalText) {
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

        // Brief glow animation when ready
        button.style.boxShadow = 'var(--glow-primary-strong)';
        setTimeout(() => {
            button.style.boxShadow = '';
        }, 500);

        return;
    }

    const remaining = getRemainingCooldown(webhookId);
    const secondsLeft = Math.ceil(remaining / 1000);
    const progress = ((COOLDOWN_DURATION - remaining) / COOLDOWN_DURATION) * 100;

    textSpan.textContent = `Ready in ${secondsLeft}s...`;
    cooldownBar.style.width = `${progress}%`;

    requestAnimationFrame(() => {
        updateCooldownDisplay(webhookId, button, cooldownBar, textSpan, originalText);
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
            updateCooldownDisplay(webhookId, button, cooldownBar, textSpan, originalText);
        } else {
            delete state.cooldowns[webhookId];
        }
    });
    saveState();
}

// === Toast Notifications ===
function showToast(message, type = 'info') {
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

    // Auto-dismiss after TOAST_DURATION
    setTimeout(() => {
        closeToast(toast);
    }, TOAST_DURATION);
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
            '.confirmation-modal.active, .settings-modal.active'
        );
        if (anyModalOpen) return;

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

    // Accent / density / layout / font-scale are data attributes so CSS
    // can target them with [data-accent="blue"] selectors once the theme
    // sheet adds those rules in later phases.
    body.dataset.accent = s.accent;
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

    btnOpen.addEventListener('click', open);
    if (btnClose) btnClose.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            close();
        }
    });

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
            showToast('Settings reset to defaults', 'info');
        });
    }
}

