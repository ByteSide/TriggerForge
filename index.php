<?php
/**
 * TriggerForge - Dark Theme Premium
 * Main Interface with Favorites, Shortcuts & Premium Features
 */

// Ensure a default timezone before the footer's date('Y') call. On shared
// hosts without date.timezone in php.ini, PHP otherwise emits an
// E_WARNING that can render above the DOCTYPE and break the HTML page.
if (!ini_get('date.timezone')) {
    date_default_timezone_set('UTC');
}

// Load config (graceful fallback if file missing or malformed)
$configPath = __DIR__ . '/config/config.php';
$config = file_exists($configPath) ? @require $configPath : [];
if (!is_array($config)) {
    $config = [];
}

// HTML render helpers (button / category markup).
require __DIR__ . '/lib/render.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <meta name="description" content="TriggerForge - Webhook Trigger Interface">
    <meta name="theme-color" content="#06171E">
    <meta name="color-scheme" content="dark light">
    <title>TriggerForge</title>
    <script>
    // Apply persisted theme BEFORE the CSS parses so a light-mode user
    // doesn't see a dark-theme flash on every page load. Same logic as
    // applySettings() but minimal and dependency-free.
    (function () {
        try {
            var raw = localStorage.getItem('triggerforge_settings');
            var theme = 'dark';
            if (raw) {
                var s = JSON.parse(raw);
                if (s && typeof s.theme === 'string') theme = s.theme;
            }
            if (theme === 'auto') {
                theme = (window.matchMedia &&
                    window.matchMedia('(prefers-color-scheme: light)').matches)
                    ? 'light' : 'dark';
            }
            if (theme === 'light' || theme === 'dark') {
                document.documentElement.dataset.theme = theme;
            }
        } catch (e) { /* localStorage unavailable — stay with default dark */ }
    })();
    </script>
    
    <!-- CSS. filemtime() query strings force the browser to refetch on
         deploy — avoids the classic "hard-reload needed after update" trap. -->
    <link rel="stylesheet" href="assets/icons/boxicons/boxicons.css">
    <link rel="stylesheet" href="css/bg.css?v=<?php echo (int)@filemtime(__DIR__.'/css/bg.css'); ?>">
    <link rel="stylesheet" href="css/style.css?v=<?php echo (int)@filemtime(__DIR__.'/css/style.css'); ?>">
    
    <!-- Favicons (relative so deployments under a subdirectory still resolve) -->
    <link rel="icon" type="image/png" href="assets/favicons/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="assets/favicons/favicon.svg" />
    <link rel="shortcut icon" href="assets/favicons/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="assets/favicons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-title" content="TriggerForge" />
    <link rel="manifest" href="assets/favicons/site.webmanifest" />
    
    <!-- Mobile Web App Settings -->
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
</head>
<body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <noscript>
        <div style="position:fixed;top:0;left:0;right:0;padding:16px;background:#ef4444;color:#fff;font-family:monospace;text-align:center;z-index:99999;">
            TriggerForge requires JavaScript. Please enable it to fire webhooks.
        </div>
    </noscript>
    <!-- Particle Canvas Background -->
    <canvas id="particle-canvas" aria-hidden="true"></canvas>
    
    <div class="container">
        <!-- Header with Typography Logo -->
        <header class="header">
            <h1 class="logo">Trigger<span class="logo__forge">Forge</span></h1>

            <!-- History drawer toggle (anchored top-right of the header) -->
            <button type="button" class="header-icon-btn history-btn" id="historyBtn" aria-label="Open trigger history" aria-expanded="false" title="History">
                <i class='bx bx-history'></i>
                <span class="header-icon-badge" id="historyBtnCount" hidden>0</span>
            </button>

            <!-- Settings (next to history) -->
            <button type="button" class="header-icon-btn settings-btn" id="settingsBtn" aria-label="Open settings" title="Settings">
                <i class='bx bx-cog'></i>
            </button>

            <!-- TEST/PROD Toggle -->
            <div class="mode-toggle-container">
                <span class="mode-toggle-label">Mode:</span>
                <div class="mode-toggle" id="modeToggle">
                    <input type="checkbox" id="modeToggleCheckbox" class="mode-toggle-input" aria-label="Toggle test mode (unchecked = PROD, checked = TEST)">
                    <label for="modeToggleCheckbox" class="mode-toggle-switch">
                        <span class="mode-toggle-option mode-prod"><i class='bx bx-server'></i> PROD</span>
                        <span class="mode-toggle-option mode-test"><i class='bx bx-bug'></i> TEST</span>
                    </label>
                </div>
            </div>
        </header>
        
        <!-- TEST Mode Banner -->
        <div class="test-mode-banner hidden" id="testModeBanner">
            <div class="test-banner-content">
                <i class='bx bx-test-tube test-banner-icon'></i>
                <div class="test-banner-text">
                    <span class="test-banner-title">TEST MODE</span>
                    <span class="test-banner-subtitle">Using webhook test URLs</span>
                </div>
                <i class='bx bx-bug-alt test-banner-icon'></i>
            </div>
        </div>
        
        <!-- Main content with Webhook Buttons -->
        <main class="main-content" id="main-content">
            <!-- Search / Filter bar. Hidden (aria-hidden) by default; JS
                 unhides it only if there's at least one button to filter,
                 so the empty-state page doesn't show a useless search box. -->
            <div class="search-bar" id="searchBar" role="search">
                <i class='bx bx-search search-bar-icon' aria-hidden="true"></i>
                <input
                    type="search"
                    id="triggerSearch"
                    class="search-bar-input"
                    placeholder="Search webhooks… (press / to focus)"
                    aria-label="Filter webhooks by name, category or description"
                    autocomplete="off"
                    spellcheck="false"
                >
                <button type="button" class="search-bar-clear" id="searchClearBtn" aria-label="Clear search" hidden>
                    <i class='bx bx-x' aria-hidden="true"></i>
                </button>
            </div>

            <!-- Quick Action Bar (Favorites) -->
            <div class="favorites-bar" id="favoritesBar">
                <div class="favorites-header">
                    <span class="favorites-title"><i class='bx bx-star'></i> Quick Actions</span>
                </div>
                <div class="favorites-scroll" id="favoritesScroll">
                    <div class="favorites-empty" id="favoritesEmpty">
                        <i class='bx bx-star'></i>
                        <p>Mark favorites with ⭐</p>
                    </div>
                </div>
            </div>
            
            <?php if (empty($config)): ?>
                <section class="empty-state" aria-labelledby="emptyStateTitle">
                    <i class='bx bxs-rocket empty-state-icon' aria-hidden="true"></i>
                    <h2 class="empty-state-title" id="emptyStateTitle">Welcome to TriggerForge</h2>
                    <p class="empty-state-text">
                        No webhooks configured yet. Copy the example config, add your own URLs, and reload the page.
                    </p>
                    <ol class="empty-state-steps">
                        <li>
                            <span class="empty-state-step-num">1</span>
                            <span>Create your config from the template:</span>
                            <code class="empty-state-code">cp config/config.example.php config/config.php</code>
                        </li>
                        <li>
                            <span class="empty-state-step-num">2</span>
                            <span>Edit <code>config/config.php</code> and list your webhook URLs in <code>webhook_url_test</code> and <code>webhook_url_prod</code>.</span>
                        </li>
                        <li>
                            <span class="empty-state-step-num">3</span>
                            <span>Reload this page — your buttons will appear here.</span>
                        </li>
                    </ol>
                    <p class="empty-state-hint">
                        <i class='bx bx-info-circle' aria-hidden="true"></i>
                        Full docs: see <code>README.md</code> and <code>SETUP_SECURITY.md</code> in the project root.
                    </p>
                </section>
            <?php else: ?>
                <?php
                    $usedCategoryIds = [];
                    $categoryIdx = 0;
                    // Track user-provided 'id' values across ALL categories so
                    // a duplicate explicit id doesn't produce colliding DOM ids
                    // or corrupt localStorage state.
                    $globalExplicitIds = [];
                ?>
                <?php foreach ($config as $categoryName => $webhooks): ?>
                    <?php
                        if (!is_array($webhooks)) { continue; }
                        // Pull out optional '_meta' (category icon / color /
                        // future category-level options) before iterating
                        // items. Still lives inside $webhooks — we just skip
                        // it in the item loop below.
                        $categoryMeta = array();
                        if (isset($webhooks['_meta']) && is_array($webhooks['_meta'])) {
                            $categoryMeta = $webhooks['_meta'];
                        }
                        $categoryIdx++;
                        $categoryNameStr = (string)$categoryName;
                        // Create URL-safe ID from category name (guaranteed unique).
                        // Collapse *any* non-[A-Za-z0-9] sequence to a single hyphen —
                        // the previous variant only replaced plain spaces, so a tab
                        // or newline in the category name leaked into the ID and
                        // broke JS CSS selectors like `[data-category-id="foo\tbar"]`.
                        $baseId = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $categoryNameStr));
                        $baseId = trim($baseId, '-');
                        if ($baseId === '') {
                            $baseId = 'category';
                        }
                        $categoryId = $baseId;
                        if (in_array($categoryId, $usedCategoryIds, true)) {
                            $categoryId = $baseId . '-' . $categoryIdx;
                        }
                        $usedCategoryIds[] = $categoryId;
                    ?>
                    <?php tf_render_category_open($categoryId, $categoryNameStr, $categoryMeta); ?>
                                <?php
                                    $usedItemIds = [];
                                    $itemOffset = 0;
                                ?>
                                <?php foreach ($webhooks as $index => $item): ?>
                                    <?php
                                        // Skip the category-level _meta key; it's not a button.
                                        if ($index === '_meta') { continue; }
                                        if (!is_array($item)) { continue; }
                                        $itemOffset++;
                                        // Determine type (default: webhook for backwards compatibility)
                                        $type = $item['type'] ?? 'webhook';
                                        // Prefer an explicit 'id' field if the config provides one.
                                        // Explicit ids survive reordering of config.php and are the
                                        // recommended way to keep favorites/cooldowns stable across
                                        // edits. Fall back to the legacy positional id otherwise.
                                        $explicitId = null;
                                        if (isset($item['id']) && is_string($item['id'])) {
                                            $candidate = preg_replace('/[^A-Za-z0-9_-]/', '', $item['id']);
                                            if ($candidate !== '') {
                                                $explicitId = $candidate;
                                            }
                                        }
                                        if ($explicitId !== null) {
                                            $itemId = $explicitId;
                                            // Duplicate explicit ids would produce colliding DOM
                                            // selectors — suffix with the positional offset so each
                                            // DOM node is reachable, but emit a comment so the
                                            // operator can spot the collision in View-Source.
                                            if (in_array($itemId, $globalExplicitIds, true)) {
                                                echo "<!-- TriggerForge: duplicate explicit id '"
                                                    . htmlspecialchars($explicitId) . "' — suffixing -->\n";
                                                $itemId = $explicitId . '-' . $itemOffset;
                                            }
                                            $globalExplicitIds[] = $itemId;
                                        } else {
                                            // Sanitize the index so string keys with special characters
                                            // can't produce an itemId that breaks JS CSS selectors
                                            // (data-webhook-id="..." queries) or localStorage keys.
                                            $safeIndex = is_int($index)
                                                ? (string)$index
                                                : preg_replace('/[^A-Za-z0-9_-]/', '', (string)$index);
                                            if ($safeIndex === '') {
                                                $safeIndex = 'item';
                                            }
                                            // Two string keys that differ only in stripped characters
                                            // (e.g. "foo bar" and "foobar") would otherwise collapse
                                            // to the same $itemId and produce duplicate DOM ids.
                                            if (in_array($safeIndex, $usedItemIds, true)) {
                                                $safeIndex .= '-' . $itemOffset;
                                            }
                                            $usedItemIds[] = $safeIndex;
                                            $itemId = $categoryId . '-' . $safeIndex;
                                        }
                                    ?>
                                    <?php if ($type === 'webhook'): ?>
                                        <?php tf_render_webhook_button($item, $itemId, $categoryNameStr); ?>
                                    <?php elseif ($type === 'link'): ?>
                                        <?php tf_render_link_button($item, $itemId, $categoryNameStr); ?>
                                    <?php elseif ($type === 'chain'): ?>
                                        <?php tf_render_chain_button($item, $itemId, $categoryNameStr); ?>
                                    <?php endif; ?>
                                <?php endforeach; ?>
                    <?php tf_render_category_close(); ?>
                <?php endforeach; ?>
            <?php endif; ?>
        </main>
        
        <!-- Footer -->
        <footer class="footer">
            <div class="footer-content">
                <div class="footer-section footer-brand">
                    <div class="footer-logo">
                        <span class="logo logo--small">Trigger<span class="logo__forge">Forge</span></span>
                    </div>
                    <p class="footer-version">v1.0.0</p>
                </div>
            </div>
            
            <div class="footer-bottom">
                <p class="footer-copyright">
                    &copy; <?php echo date('Y'); ?> · Made with <i class='bx bxs-heart' style="color: #FD7D00;"></i> by 
                    <a href="https://byteside.io" target="_blank" rel="noopener noreferrer" class="footer-byteside-link" aria-label="ByteSide.io (opens in a new tab)">
                        <span class="byteside-logo">Byte<span class="byteside-logo__side">Side</span><span class="byteside-logo__dot">.</span><span class="byteside-logo__io">io</span></span>
                    </a>
                </p>
            </div>
        </footer>
    </div>
    
    <!-- Toast Container -->
    <div class="toast-container" id="toastContainer" role="status" aria-live="polite" aria-atomic="false"></div>
    
    <!-- Confirmation Modal -->
    <div class="confirmation-modal-backdrop" id="confirmationModalBackdrop" aria-hidden="true" inert></div>
    <div class="confirmation-modal" id="confirmationModal" role="dialog" aria-modal="true" aria-labelledby="confirmationModalTitle" aria-describedby="confirmationModalText" aria-hidden="true" inert>
        <div class="confirmation-modal-content">
            <div class="confirmation-modal-header">
                <i class='bx bx-bolt confirmation-modal-icon'></i>
                <h3 class="confirmation-modal-title" id="confirmationModalTitle">Ready to fire?</h3>
            </div>
            <div class="confirmation-modal-body">
                <p class="confirmation-modal-text" id="confirmationModalText">
                    Ready to trigger <strong id="confirmationModalWebhookName">Webhook</strong>?
                </p>
            </div>
            <div class="confirmation-modal-footer">
                <button class="confirmation-modal-btn confirmation-modal-btn-cancel" id="confirmationModalBtnCancel" type="button">
                    <i class='bx bx-x-circle'></i>
                    <span>Cancel</span>
                </button>
                <button class="confirmation-modal-btn confirmation-modal-btn-confirm" id="confirmationModalBtnConfirm" type="button">
                    <i class='bx bxs-fire-alt'></i>
                    <span>FIRE!</span>
                </button>
            </div>
        </div>
    </div>
    
    <!-- History drawer — slide-in panel from the right. Populated by
         renderHistoryList() from state.history (localStorage). -->
    <aside class="history-drawer" id="historyDrawer" role="complementary" aria-labelledby="historyDrawerTitle" aria-hidden="true" inert>
        <header class="history-drawer-header">
            <i class='bx bx-history history-drawer-icon' aria-hidden="true"></i>
            <h3 class="history-drawer-title" id="historyDrawerTitle">Trigger history</h3>
            <button type="button" class="history-drawer-action" id="historyClearBtn" title="Clear history">
                <i class='bx bx-trash' aria-hidden="true"></i>
                <span>Clear</span>
            </button>
            <button type="button" class="history-drawer-close" id="historyCloseBtn" aria-label="Close history">
                <i class='bx bx-x' aria-hidden="true"></i>
            </button>
        </header>
        <div class="history-drawer-body" id="historyList" role="list"></div>
    </aside>

    <!-- Generic modal — title / body / action-row. Used by the response
         viewer, the keyboard-shortcut cheatsheet, and any later feature
         that needs a dialog. Content is populated by openModal() in app.js. -->
    <div class="generic-modal-backdrop" id="genericModalBackdrop" aria-hidden="true" inert></div>
    <div class="generic-modal" id="genericModal" role="dialog" aria-modal="true" aria-labelledby="genericModalTitle" aria-hidden="true" inert>
        <div class="generic-modal-content">
            <div class="generic-modal-header">
                <i class='bx bx-info-circle generic-modal-icon' id="genericModalIcon" aria-hidden="true"></i>
                <h3 class="generic-modal-title" id="genericModalTitle">Title</h3>
                <button type="button" class="generic-modal-close" id="genericModalBtnClose" aria-label="Close">
                    <i class='bx bx-x' aria-hidden="true"></i>
                </button>
            </div>
            <div class="generic-modal-body" id="genericModalBody"></div>
            <div class="generic-modal-footer" id="genericModalFooter"></div>
        </div>
    </div>

    <!-- Settings Modal -->
    <div class="settings-modal-backdrop" id="settingsModalBackdrop" aria-hidden="true" inert></div>
    <div class="settings-modal" id="settingsModal" role="dialog" aria-modal="true" aria-labelledby="settingsModalTitle" aria-hidden="true" inert>
        <div class="settings-modal-content">
            <div class="settings-modal-header">
                <i class='bx bx-cog settings-modal-icon' aria-hidden="true"></i>
                <h3 class="settings-modal-title" id="settingsModalTitle">Settings</h3>
                <button type="button" class="settings-modal-close" id="settingsModalBtnClose" aria-label="Close settings">
                    <i class='bx bx-x' aria-hidden="true"></i>
                </button>
            </div>
            <div class="settings-modal-body">
                <div class="settings-section">
                    <h4 class="settings-section-title">Appearance</h4>
                    <div class="settings-field">
                        <span class="settings-label" id="themeLabel">Theme</span>
                        <div class="settings-segmented" role="radiogroup" aria-labelledby="themeLabel">
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="theme" data-value="auto" aria-checked="false">
                                <i class='bx bx-adjust' aria-hidden="true"></i> Auto
                            </button>
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="theme" data-value="dark" aria-checked="false">
                                <i class='bx bx-moon' aria-hidden="true"></i> Dark
                            </button>
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="theme" data-value="light" aria-checked="false">
                                <i class='bx bx-sun' aria-hidden="true"></i> Light
                            </button>
                        </div>
                    </div>

                    <div class="settings-field">
                        <span class="settings-label" id="accentLabel">Accent</span>
                        <div class="settings-swatches" role="radiogroup" aria-labelledby="accentLabel">
                            <button type="button" role="radio" class="settings-swatch" data-setting="accent" data-value="orange" style="--swatch: #FD7D00" aria-checked="false" aria-label="Orange"></button>
                            <button type="button" role="radio" class="settings-swatch" data-setting="accent" data-value="blue"   style="--swatch: #3B82F6" aria-checked="false" aria-label="Blue"></button>
                            <button type="button" role="radio" class="settings-swatch" data-setting="accent" data-value="green"  style="--swatch: #10B981" aria-checked="false" aria-label="Green"></button>
                            <button type="button" role="radio" class="settings-swatch" data-setting="accent" data-value="red"    style="--swatch: #EF4444" aria-checked="false" aria-label="Red"></button>
                            <button type="button" role="radio" class="settings-swatch" data-setting="accent" data-value="violet" style="--swatch: #8B5CF6" aria-checked="false" aria-label="Violet"></button>
                            <button type="button" role="radio" class="settings-swatch" data-setting="accent" data-value="pink"   style="--swatch: #EC4899" aria-checked="false" aria-label="Pink"></button>
                        </div>
                    </div>

                    <div class="settings-field">
                        <span class="settings-label" id="densityLabel">Density</span>
                        <div class="settings-segmented" role="radiogroup" aria-labelledby="densityLabel">
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="density" data-value="compact" aria-checked="false">Compact</button>
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="density" data-value="comfortable" aria-checked="false">Comfortable</button>
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="density" data-value="spacious" aria-checked="false">Spacious</button>
                        </div>
                    </div>

                    <div class="settings-field">
                        <span class="settings-label" id="layoutLabel">Layout</span>
                        <div class="settings-segmented" role="radiogroup" aria-labelledby="layoutLabel">
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="layout" data-value="grid" aria-checked="false">
                                <i class='bx bx-grid-alt' aria-hidden="true"></i> Grid
                            </button>
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="layout" data-value="list" aria-checked="false">
                                <i class='bx bx-list-ul' aria-hidden="true"></i> List
                            </button>
                        </div>
                    </div>

                    <div class="settings-field">
                        <span class="settings-label" id="fontScaleLabel">Text size</span>
                        <div class="settings-segmented" role="radiogroup" aria-labelledby="fontScaleLabel">
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="fontScale" data-value="0.875" aria-checked="false">Small</button>
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="fontScale" data-value="1" aria-checked="false">Default</button>
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="fontScale" data-value="1.125" aria-checked="false">Large</button>
                            <button type="button" role="radio" class="settings-seg-btn" data-setting="fontScale" data-value="1.25" aria-checked="false">XL</button>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h4 class="settings-section-title">Behavior</h4>
                    <label class="settings-field settings-field-toggle">
                        <span class="settings-label">Show "last triggered" timestamps</span>
                        <input type="checkbox" class="settings-toggle" data-setting="showLastTriggered">
                    </label>
                    <label class="settings-field settings-field-toggle">
                        <span class="settings-label">Show trigger-count badges</span>
                        <input type="checkbox" class="settings-toggle" data-setting="showCounters">
                    </label>
                    <label class="settings-field settings-field-toggle">
                        <span class="settings-label">Haptic feedback on successful fire</span>
                        <input type="checkbox" class="settings-toggle" data-setting="haptic">
                    </label>
                    <label class="settings-field settings-field-toggle">
                        <span class="settings-label">Pull-to-refresh (mobile)</span>
                        <input type="checkbox" class="settings-toggle" data-setting="enablePullToRefresh">
                    </label>
                </div>

                <section class="settings-section" id="settingsAppSection" hidden>
                    <h4 class="settings-section-title">App</h4>
                    <button type="button" class="settings-action-btn" id="settingsInstallBtn">
                        <i class='bx bx-mobile-alt' aria-hidden="true"></i>
                        <span>Install as app</span>
                    </button>
                </section>

                <div class="settings-section">
                    <h4 class="settings-section-title">Data</h4>
                    <a href="admin.php" class="settings-action-btn">
                        <i class='bx bx-edit' aria-hidden="true"></i>
                        <span>Open config editor</span>
                    </a>
                    <div class="settings-action-row">
                        <a href="api/export.php" class="settings-action-btn" download>
                            <i class='bx bx-download' aria-hidden="true"></i>
                            <span>Export config</span>
                        </a>
                        <button type="button" class="settings-action-btn" id="settingsImportBtn">
                            <i class='bx bx-upload' aria-hidden="true"></i>
                            <span>Import config</span>
                        </button>
                        <input type="file" id="settingsImportFile" accept="application/json,.json" hidden>
                    </div>
                    <button type="button" class="settings-action-btn" id="settingsResetBtn">
                        <i class='bx bx-reset' aria-hidden="true"></i>
                        <span>Reset settings to defaults</span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Pull-to-refresh indicator — fixed top-center, visible during pull. -->
    <div class="ptr-indicator" id="ptrIndicator" aria-hidden="true">
        <i class='bx bx-refresh' aria-hidden="true"></i>
    </div>

    <!-- Bulk Fire Bar — fixed bottom-right when at least one webhook
         button has been Shift-clicked. Escape clears the selection. -->
    <div class="bulk-fire-bar" id="bulkFireBar" aria-hidden="true" role="region" aria-label="Bulk fire selection">
        <span class="bulk-fire-label">
            <i class='bx bx-checkbox-checked' aria-hidden="true"></i>
            <strong id="bulkFireCount">0</strong>
            <span>selected</span>
        </span>
        <button type="button" class="bulk-fire-clear" id="bulkClearBtn">
            <i class='bx bx-x' aria-hidden="true"></i>
            <span>Clear</span>
        </button>
        <button type="button" class="bulk-fire-go" id="bulkFireBtn">
            <i class='bx bxs-fire-alt' aria-hidden="true"></i>
            <span>Fire all</span>
        </button>
    </div>

    <!-- Scroll to Top Button -->
    <button class="scroll-to-top" id="scrollToTopBtn" aria-label="Scroll to top">
        <i class='bx bx-chevron-up'></i>
    </button>
    
    <!-- JavaScript -->
    <script src="js/particles.js?v=<?php echo (int)@filemtime(__DIR__.'/js/particles.js'); ?>"></script>
    <script src="js/app.js?v=<?php echo (int)@filemtime(__DIR__.'/js/app.js'); ?>"></script>
</body>
</html>
