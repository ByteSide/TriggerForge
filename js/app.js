/**
 * TriggerForge - Dark Theme Premium
 * Complete JavaScript with all Premium Features
 */

// === Global State ===
const state = {
    favorites: [],
    cooldowns: {},
    categoryStates: {},
    isTestMode: false
};

// === Constants ===
const COOLDOWN_DURATION = 10000; // 10 seconds
const TOAST_DURATION = 4000; // 4 seconds
const MAX_FAVORITES = 10;
const MAX_TOASTS = 5; // cap concurrent toasts to prevent DOM bloat on spam
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function isSafeLinkUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url, window.location.href);
        return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol);
    } catch (e) {
        return false;
    }
}

// === Initialization ===
document.addEventListener('DOMContentLoaded', function() {
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

    // Initialize all modules
    initAccordion();
    initFavorites();
    initWebhookButtons();
    initLinkButtons();
    initModeToggle();
    initConfirmationModal();
    initScrollToTop();

    // Restore cooldowns from previous session
    restoreCooldowns();

    console.log('✅ TriggerForge Premium Ready!');
});

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
}

function saveState() {
    // Write each key independently so a quota error on one key doesn't
    // leave the remaining keys stale and out of sync with in-memory state.
    const writes = [
        ['triggerforge_favorites', state.favorites],
        ['triggerforge_categories_state', state.categoryStates],
        ['triggerforge_cooldowns', state.cooldowns],
        ['triggerforge_test_mode', state.isTestMode]
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
        const content = document.querySelector(`.category-content[data-category-id="${categoryId}"]`);

        if (!content) return;

        // Apply saved state (default: open)
        const isOpen = state.categoryStates.hasOwnProperty(categoryId) ? state.categoryStates[categoryId] : true;

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
    const header = document.querySelector(`.category-header[data-category-id="${categoryId}"]`);
    const content = document.querySelector(`.category-content[data-category-id="${categoryId}"]`);

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
            img.src = faviconSrc;
            img.alt = '';
            img.className = 'favorite-link-btn-favicon';
            img.onerror = function () {
                this.style.display = 'none';
                if (this.nextElementSibling) {
                    this.nextElementSibling.style.display = 'inline-block';
                }
            };
            btn.appendChild(img);

            const fallback = document.createElement('i');
            fallback.className = 'bx bx-link-alt favorite-link-btn-icon';
            fallback.style.display = 'none';
            fallback.setAttribute('aria-hidden', 'true');
            btn.appendChild(fallback);
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

// Open a URL in a new tab, handling mailto:/tel: protocols that don't
// return a real window handle. Returns true on "looked successful".
function openLinkSafely(url, name) {
    let protocol = '';
    try { protocol = new URL(url, window.location.href).protocol; } catch (e) {}

    // mailto:/tel: hand off to the OS handler. window.open returns null
    // for these in most browsers — so we use a synthetic <a> click instead
    // and assume success rather than falsely warning "Popup blocked".
    if (protocol === 'mailto:' || protocol === 'tel:') {
        const a = document.createElement('a');
        a.href = url;
        a.rel = 'noopener noreferrer';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`🔗 ${name} opened`, 'info');
        return;
    }

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) {
        showToast(`🔗 ${name} opened`, 'info');
    } else {
        showToast('Popup blocked — allow popups for this site', 'warning');
    }
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
    // Disable button and show loading state
    button.disabled = true;
    button.classList.add('loading');
    const icon = button.querySelector('.trigger-btn-icon');
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

    // Show modal with animation
    backdrop.classList.add('active');
    modal.classList.add('active');

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

    if (confirmationModalReturnFocus && typeof confirmationModalReturnFocus.focus === 'function') {
        try { confirmationModalReturnFocus.focus(); } catch (e) { /* detached node */ }
    }
    confirmationModalReturnFocus = null;
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
    
    // Scroll to top when clicked
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        
        // Brief haptic feedback via animation
        scrollToTopBtn.style.transform = 'translateX(-50%) scale(0.9)';
        setTimeout(() => {
            scrollToTopBtn.style.transform = '';
        }, 150);
    });
}

