<?php
/**
 * TriggerForge — web config editor.
 *
 * Basic-Auth-gated (the directory's .htaccess covers this file too).
 * Reads the current config.php, hands it to js/admin.js as a bootstrap
 * object on window, and lets the user CRUD items + categories in the
 * browser. "Save" POSTs the full config to api/import.php which
 * validates + backs up + atomically writes config.php.
 */

if (!ini_get('date.timezone')) {
    date_default_timezone_set('UTC');
}

$configPath = __DIR__ . '/config/config.php';
$config = file_exists($configPath) ? @require $configPath : [];
if (!is_array($config)) {
    $config = [];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <title>TriggerForge · Config Editor</title>
    <script>
    // Same theme-flash-prevention inline as the main app.
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
        } catch (e) {}
    })();
    </script>
    <link rel="stylesheet" href="assets/icons/boxicons/boxicons.css">
    <link rel="stylesheet" href="css/bg.css?v=<?php echo (int)@filemtime(__DIR__.'/css/bg.css'); ?>">
    <link rel="stylesheet" href="css/style.css?v=<?php echo (int)@filemtime(__DIR__.'/css/style.css'); ?>">
    <link rel="stylesheet" href="css/admin.css?v=<?php echo (int)@filemtime(__DIR__.'/css/admin.css'); ?>">
</head>
<body>
    <a class="skip-link" href="#adminBody">Skip to content</a>

    <div class="admin-container">
        <header class="admin-header">
            <h1 class="admin-title">
                <a href="./" class="admin-home">Trigger<span class="logo__forge">Forge</span></a>
                <span class="admin-subtitle">· Config Editor</span>
            </h1>
            <div class="admin-actions">
                <a href="./" class="admin-btn admin-btn-default" title="Back to dashboard">
                    <i class='bx bx-arrow-back' aria-hidden="true"></i>
                    <span>Back</span>
                </a>
                <button type="button" id="adminAddCatBtn" class="admin-btn admin-btn-default">
                    <i class='bx bx-folder-plus' aria-hidden="true"></i>
                    <span>Add category</span>
                </button>
                <button type="button" id="adminSaveBtn" class="admin-btn admin-btn-primary">
                    <i class='bx bx-save' aria-hidden="true"></i>
                    <span>Save config</span>
                </button>
            </div>
        </header>

        <p class="admin-hint">
            <i class='bx bx-info-circle' aria-hidden="true"></i>
            Every save writes <code>config/config.php</code> and backs up the previous version to
            <code>config/backups/</code>. Invalid configs are rejected before the write.
        </p>

        <main id="adminBody" class="admin-body"></main>
    </div>

    <!-- Toast container (styles reused from css/style.css) -->
    <div class="toast-container" id="toastContainer" role="status" aria-live="polite" aria-atomic="false"></div>

    <!-- Generic modal (duplicated markup so admin.js doesn't need the whole app.js) -->
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

    <script>
        window.__TF_INITIAL_CONFIG__ = <?php
            echo json_encode(
                $config,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
            );
        ?>;
    </script>
    <script src="js/admin.js?v=<?php echo (int)@filemtime(__DIR__.'/js/admin.js'); ?>"></script>
</body>
</html>
