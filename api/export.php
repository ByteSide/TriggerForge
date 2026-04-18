<?php
/**
 * TriggerForge — config export endpoint.
 *
 * GET /api/export.php → downloads the current config.php serialised as
 * pretty-printed JSON. Basic Auth gates access via .htaccess so the
 * download link is only reachable for authenticated users.
 *
 * Output shape matches config/config.schema.json — same array loaded
 * from config.php, just as JSON instead of PHP literal.
 */

header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Only GET requests allowed']);
    exit;
}

$configPath = __DIR__ . '/../config/config.php';
if (!file_exists($configPath)) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Configuration file not found']);
    exit;
}

$config = @require $configPath;
if (!is_array($config)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Invalid configuration']);
    exit;
}

$filename = 'triggerforge-config-' . date('Ymd-His') . '.json';
header('Content-Type: application/json; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
echo json_encode(
    $config,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
);
