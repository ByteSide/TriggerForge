/**
 * Theme flash prevention. Runs SYNCHRONOUSLY before the CSS finishes
 * parsing so a light-mode user never flashes the dark default. Kept as
 * a separate file so the CSP `script-src 'self'` policy still applies
 * — an inline <script> would be blocked in production.
 */
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
