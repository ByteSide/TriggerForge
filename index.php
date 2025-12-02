<?php
/**
 * TriggerForge - Dark Theme Premium
 * Main Interface with Favorites, Shortcuts & Premium Features
 */

// Load config
$config = require __DIR__ . '/config/config.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <meta name="description" content="TriggerForge - Webhook Trigger Interface">
    <meta name="theme-color" content="#06171E">
    <title>TriggerForge</title>
    
    <!-- CSS -->
    <link rel="stylesheet" href="assets/icons/boxicons/boxicons.css">
    <link rel="stylesheet" href="css/bg.css">
    <link rel="stylesheet" href="css/style.css">
    
    <!-- Favicons -->
    <link rel="icon" type="image/png" href="/assets/favicons/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicons/favicon.svg" />
    <link rel="shortcut icon" href="/assets/favicons/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-title" content="TriggerForge" />
    <link rel="manifest" href="/assets/favicons/site.webmanifest" />
    
    <!-- Mobile Web App Settings -->
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
</head>
<body>
    <!-- Particle Canvas Background -->
    <canvas id="particle-canvas" aria-hidden="true"></canvas>
    
    <div class="container">
        <!-- Header with Typography Logo -->
        <header class="header">
            <span class="logo">Trigger<span class="logo__forge">Forge</span></span>
            
            <!-- TEST/PROD Toggle -->
            <div class="mode-toggle-container">
                <span class="mode-toggle-label">Mode:</span>
                <div class="mode-toggle" id="modeToggle">
                    <input type="checkbox" id="modeToggleCheckbox" class="mode-toggle-input">
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
        <main class="main-content">
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
                <div class="category-section">
                    <div class="favorites-empty">
                        <i class='bx bx-error-circle'></i>
                        <p>No webhooks configured.</p>
                        <p style="margin-top: 8px;">Please edit <code>config/config.php</code></p>
                    </div>
                </div>
            <?php else: ?>
                <?php foreach ($config as $categoryName => $webhooks): ?>
                    <?php 
                        // Create URL-safe ID from category name
                        $categoryId = strtolower(str_replace(' ', '-', preg_replace('/[^A-Za-z0-9\s-]/', '', $categoryName)));
                    ?>
                    <section class="category-section">
                        <div class="category-header" data-category-id="<?php echo htmlspecialchars($categoryId); ?>">
                            <i class='bx bx-folder category-header-icon'></i>
                            <h2 class="category-title"><?php echo htmlspecialchars($categoryName); ?></h2>
                            <i class='bx bx-chevron-down category-icon'></i>
                        </div>
                        
                        <div class="category-content" data-category-id="<?php echo htmlspecialchars($categoryId); ?>">
                            <div class="button-grid">
                                <?php foreach ($webhooks as $index => $item): ?>
                                    <?php 
                                        // Determine type (default: webhook for backwards compatibility)
                                        $type = $item['type'] ?? 'webhook';
                                        $itemId = $categoryId . '-' . $index;
                                    ?>
                                    
                                    <?php if ($type === 'webhook'): ?>
                                        <!-- Webhook Button -->
                                        <button 
                                            class="trigger-btn"
                                            data-type="webhook"
                                            data-webhook-id="<?php echo htmlspecialchars($itemId); ?>"
                                            data-webhook-url-prod="<?php echo htmlspecialchars($item['webhook_url_prod']); ?>"
                                            data-webhook-url-test="<?php echo htmlspecialchars($item['webhook_url_test']); ?>"
                                            data-webhook-name="<?php echo htmlspecialchars($item['name']); ?>"
                                            data-category="<?php echo htmlspecialchars($categoryName); ?>"
                                            title="<?php echo htmlspecialchars($item['description'] ?? $item['name']); ?>"
                                            aria-label="<?php echo htmlspecialchars($item['name']); ?>"
                                        >
                                            <div class="trigger-btn-cooldown"></div>
                                            <i class='bx bx-bolt trigger-btn-icon'></i>
                                            <span class="trigger-btn-text"><?php echo htmlspecialchars($item['name']); ?></span>
                                            <i class='bx bx-star trigger-btn-favorite' data-webhook-id="<?php echo htmlspecialchars($itemId); ?>" title="Add to favorites"></i>
                                        </button>
                                    
                                    <?php elseif ($type === 'link'): ?>
                                        <!-- Custom Link Button -->
                                        <?php
                                            // Generate favicon URL
                                            $domain = parse_url($item['url'], PHP_URL_HOST);
                                            $faviconUrl = "https://www.google.com/s2/favicons?domain=" . urlencode($domain) . "&sz=32";
                                        ?>
                                        <button 
                                            class="custom-link-btn"
                                            data-type="link"
                                            data-link-id="<?php echo htmlspecialchars($itemId); ?>"
                                            data-link-url="<?php echo htmlspecialchars($item['url']); ?>"
                                            data-link-name="<?php echo htmlspecialchars($item['name']); ?>"
                                            data-category="<?php echo htmlspecialchars($categoryName); ?>"
                                            title="<?php echo htmlspecialchars($item['description'] ?? $item['name']); ?>"
                                            aria-label="<?php echo htmlspecialchars($item['name']); ?>"
                                        >
                                            <img src="<?php echo htmlspecialchars($faviconUrl); ?>" 
                                                 alt="Icon" 
                                                 class="link-btn-favicon"
                                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                                            <i class='bx bx-link-external link-btn-icon-fallback' style="display:none;"></i>
                                            <span class="link-btn-text"><?php echo htmlspecialchars($item['name']); ?></span>
                                            <i class='bx bx-external-link link-btn-indicator'></i>
                                            <i class='bx bx-star link-btn-favorite' data-link-id="<?php echo htmlspecialchars($itemId); ?>" title="Add to favorites"></i>
                                        </button>
                                    <?php endif; ?>
                                    
                                <?php endforeach; ?>
                            </div>
                        </div>
                    </section>
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
                    <a href="https://byteside.io" target="_blank" rel="noopener noreferrer" class="footer-byteside-link">
                        <span class="byteside-logo">Byte<span class="byteside-logo__side">Side</span><span class="byteside-logo__dot">.</span><span class="byteside-logo__io">io</span></span>
                    </a>
                </p>
            </div>
        </footer>
    </div>
    
    <!-- Toast Container -->
    <div class="toast-container" id="toastContainer"></div>
    
    <!-- Confirmation Modal -->
    <div class="confirmation-modal-backdrop" id="confirmationModalBackdrop"></div>
    <div class="confirmation-modal" id="confirmationModal" role="dialog" aria-modal="true" aria-labelledby="confirmationModalTitle">
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
                    <i class='bxs bxs-fire-alt'></i>
                    <span>FIRE!</span>
                </button>
            </div>
        </div>
    </div>
    
    <!-- Scroll to Top Button -->
    <button class="scroll-to-top" id="scrollToTopBtn" aria-label="Scroll to top">
        <i class='bx bx-chevron-up'></i>
    </button>
    
    <!-- JavaScript -->
    <script src="js/particles.js"></script>
    <script src="js/app.js"></script>
</body>
</html>
