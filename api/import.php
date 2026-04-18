<?php
/**
 * TriggerForge — config import endpoint.
 *
 * POST /api/import.php with Content-Type: application/json.
 *   - Body is the entire new config (same shape as config/config.php's
 *     return value, serialised to JSON).
 *   - Validated against the same rules the CLI validator uses.
 *   - Old config.php backed up to config/backups/config.<ts>.php.bak
 *     (ring buffer of 10; backup filename ends with .bak so the existing
 *      .htaccess FilesMatch denies HTTP access).
 *   - Written atomically (tmp + rename) so a crash mid-write can't leave
 *     a half-file on disk.
 *
 * Security: same JSON-only Content-Type gate as trigger.php (blocks
 * cross-site text/plain form CSRF), strict size cap, no shell-outs,
 * no var_export of anything untyped.
 */

// Ensure a default timezone before any date() call. On shared hosts
// without date.timezone in php.ini, PHP otherwise emits an E_WARNING
// that gets sent after the JSON headers and corrupts the response.
if (!ini_get('date.timezone')) {
    date_default_timezone_set('UTC');
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'message' => 'Only POST requests allowed']);
    exit;
}

$ctHeader = trim($_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
if (stripos($ctHeader, 'application/json') !== 0) {
    http_response_code(415);
    echo json_encode(['success' => false, 'message' => 'Content-Type must be application/json']);
    exit;
}

// 256 KB is generous even for a 500-webhook config.
$maxSize = 256 * 1024;
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? ($_SERVER['HTTP_CONTENT_LENGTH'] ?? 0));
if ($contentLength > $maxSize) {
    http_response_code(413);
    echo json_encode(['success' => false, 'message' => 'Payload too large']);
    exit;
}

$raw = file_get_contents('php://input', false, null, 0, $maxSize);
if ($raw === false) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Failed to read request body']);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Request body is not a JSON object (got ' . (json_last_error_msg() ?: 'unknown') . ')',
    ]);
    exit;
}

// Validate against the same rules the CLI tool uses.
require_once __DIR__ . '/../lib/validate-config.php';
$errors = tf_validate_config($data);
if (!empty($errors)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Configuration validation failed',
        'errors'  => $errors,
    ]);
    exit;
}

$configPath = __DIR__ . '/../config/config.php';
$backupDir  = __DIR__ . '/../config/backups';

// Backup current config (if any) before we overwrite. Ring-buffer to
// the 10 most recent so /config/backups doesn't grow unbounded.
if (file_exists($configPath)) {
    if (!is_dir($backupDir)) {
        @mkdir($backupDir, 0750, true);
    }
    if (is_dir($backupDir) && is_writable($backupDir)) {
        $ts = date('Ymd-His');
        $backupFile = $backupDir . '/config.' . $ts . '.php.bak';
        @copy($configPath, $backupFile);

        $backups = glob($backupDir . '/config.*.php.bak');
        if (is_array($backups) && count($backups) > 10) {
            sort($backups);
            $excess = count($backups) - 10;
            for ($i = 0; $i < $excess; $i++) {
                @unlink($backups[$i]);
            }
        }
    }
    // If the backup folder isn't writable, continue anyway — the
    // operator sees the config live, and this is localhost/single-user
    // tier. Better to allow the write than to hard-fail on a cosmetic
    // issue.
}

// Build the PHP source. var_export on an array produced by json_decode
// only contains array / string / int / float / bool / null literals —
// no code injection path. The leading '<?php\n' + trailing '\n' keeps
// the file parseable.
$phpSource = "<?php\n"
           . "// Written by api/import.php on " . date('c') . "\n"
           . "return " . var_export($data, true) . ";\n";

// Atomic write: temp file in the same directory + rename. rename() is
// atomic on POSIX filesystems so there's never a partial config.php
// visible to the running app.
if (!is_dir(dirname($configPath)) || !is_writable(dirname($configPath))) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Config directory is not writable on this server',
    ]);
    exit;
}
$tmpFile = $configPath . '.tmp.' . bin2hex(random_bytes(4));
$bytes = @file_put_contents($tmpFile, $phpSource, LOCK_EX);
if ($bytes === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to write temp config']);
    exit;
}
if (!@rename($tmpFile, $configPath)) {
    @unlink($tmpFile);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to swap config into place']);
    exit;
}

echo json_encode([
    'success' => true,
    'message' => 'Configuration imported',
    'bytes'   => $bytes,
]);
