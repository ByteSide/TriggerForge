<?php
/**
 * TriggerForge — version resolver.
 *
 * Tries, in order:
 *   1. `git describe --tags --always --dirty` if exec() is available
 *      and git metadata exists (local dev, some hosting).
 *   2. package.json's "version" field.
 *   3. Hardcoded fallback.
 *
 * Memoised per-request so repeated calls don't shell out repeatedly.
 */

if (!function_exists('tf_version')) {
    function tf_version() {
        static $cached = null;
        if ($cached !== null) return $cached;

        $root = dirname(__DIR__);

        // 1. Try `git describe`. exec() is disabled on a lot of shared
        //    hosts, so fail soft.
        if (function_exists('exec') && !function_exists('tf_exec_disabled')) {
            $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
            if (!in_array('exec', $disabled, true)) {
                $out = [];
                $rc = 0;
                @exec(
                    'git -C ' . escapeshellarg($root) . ' describe --tags --always --dirty 2>/dev/null',
                    $out,
                    $rc
                );
                if ($rc === 0 && !empty($out)) {
                    $v = trim((string)$out[0]);
                    if ($v !== '') {
                        // Strip leading 'v' if present so output is consistent
                        // between "1.2.3" (package.json) and "v1.2.3-4-gabc" (git).
                        if ($v[0] === 'v' || $v[0] === 'V') $v = substr($v, 1);
                        return $cached = $v;
                    }
                }
            }
        }

        // 2. package.json
        $pkgFile = $root . '/package.json';
        if (file_exists($pkgFile)) {
            $raw = @file_get_contents($pkgFile);
            if ($raw !== false) {
                $pkg = json_decode($raw, true);
                if (is_array($pkg) && isset($pkg['version']) && is_string($pkg['version']) && $pkg['version'] !== '') {
                    return $cached = $pkg['version'];
                }
            }
        }

        // 3. Hardcoded fallback so the UI / outbound User-Agent always has
        //    *something*.
        return $cached = '1.0.0';
    }
}
