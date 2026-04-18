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
    /**
     * Strip anything that would be unsafe to embed into an HTTP header
     * (CR/LF for header injection) or into a filename / log line. Keeps
     * the result to a conservative charset even if git or package.json
     * produce something exotic.
     */
    function tf_version_sanitize($v) {
        $v = (string)$v;
        // Kill CR/LF explicitly so `User-Agent: TriggerForge/<v>` can never
        // sprout a fake second header.
        $v = str_replace(["\r", "\n"], '', $v);
        // Keep only the characters a real version string actually uses.
        $v = preg_replace('/[^A-Za-z0-9._+\-]/', '', $v);
        if ($v === null || $v === '') return '1.1.0';
        // Cap length so a runaway git describe can't produce a 10 KB header.
        return substr($v, 0, 64);
    }

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
                        return $cached = tf_version_sanitize($v);
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
                    return $cached = tf_version_sanitize($pkg['version']);
                }
            }
        }

        // 3. Hardcoded fallback so the UI / outbound User-Agent always has
        //    *something*.
        return $cached = '1.1.0';
    }
}
