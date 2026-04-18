<?php
/**
 * TriggerForge - Webhook Trigger API
 * 
 * This script receives POST requests from the frontend and
 * triggers the configured webhooks server-side.
 */

// Ensure a default timezone before any date() call. On shared hosts
// without date.timezone in php.ini, PHP emits an E_WARNING for every
// date() invocation that gets written to the error log on each webhook
// fire. UTC is a safe, stable choice for a trigger timestamp.
if (!ini_get('date.timezone')) {
    date_default_timezone_set('UTC');
}

// JSON Response Header
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// Only allow POST requests. RFC 7231 requires a 405 response to include
// an Allow header listing the methods that *are* supported.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode([
        'success' => false,
        'message' => 'Only POST requests allowed'
    ]);
    exit;
}

// Require Content-Type: application/json. Without this, a cross-site
// <form enctype="text/plain"> can construct a body that happens to parse
// as valid JSON (e.g. `{"webhook_url":"https://known/hook","a":"="}`) and
// ride the victim's cached Basic Auth to fire any whitelisted webhook —
// classic CSRF. Browsers cannot set Content-Type to application/json on a
// simple form submission, so requiring it blocks the attack.
// trim() so that a middleware-inserted leading space in the header
// doesn't cause `stripos` to return a non-zero position and wrongly
// reject a legitimate "application/json" payload.
$contentType = trim($_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
if (stripos($contentType, 'application/json') !== 0) {
    http_response_code(415);
    echo json_encode([
        'success' => false,
        'message' => 'Content-Type must be application/json'
    ]);
    exit;
}

// Reject unreasonably large bodies before reading them into memory. The
// legitimate payload is a tiny JSON object (`{"webhook_url":"..."}`) — a
// few hundred bytes — so an 8KB cap is generous. Without this, an attacker
// could send a multi-MB body and eat server memory.
// Some CGI/FastCGI setups only expose HTTP_CONTENT_LENGTH, not the
// standard CONTENT_LENGTH — check both to stay compatible.
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? ($_SERVER['HTTP_CONTENT_LENGTH'] ?? 0));
if ($contentLength > 8192) {
    http_response_code(413);
    echo json_encode([
        'success' => false,
        'message' => 'Payload too large'
    ]);
    exit;
}

// Get webhook URL from POST data (cap to 8KB as defense in depth if the
// client lied about Content-Length).
$rawInput = file_get_contents('php://input', false, null, 0, 8192);
$input = json_decode($rawInput !== false ? $rawInput : '', true);
if (!is_array($input)) {
    $input = [];
}
$webhookUrl = isset($input['webhook_url']) && is_string($input['webhook_url'])
    ? $input['webhook_url']
    : '';

if (empty($webhookUrl)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'No webhook URL provided'
    ]);
    exit;
}

// Load config and validate that URL is in whitelist
$configPath = __DIR__ . '/../config/config.php';
if (!file_exists($configPath)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Configuration file not found'
    ]);
    exit;
}

$config = @require $configPath;
if (!is_array($config)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid configuration'
    ]);
    exit;
}
$validUrls = [];

// Collect all configured URLs (Test + Prod).
// Keys starting with '_' are reserved metadata (e.g. '_meta' for a
// category icon/color) and must not contribute to the whitelist —
// otherwise a mistake like '_meta' => ['webhook_url_prod' => '...']
// would silently authorise a URL.
foreach ($config as $category => $webhooks) {
    if (!is_array($webhooks)) {
        continue;
    }
    foreach ($webhooks as $key => $webhook) {
        if (is_string($key) && strlen($key) > 0 && $key[0] === '_') {
            continue;
        }
        if (!is_array($webhook)) {
            continue;
        }
        if (isset($webhook['webhook_url_test']) && is_string($webhook['webhook_url_test'])) {
            $validUrls[] = $webhook['webhook_url_test'];
        }
        if (isset($webhook['webhook_url_prod']) && is_string($webhook['webhook_url_prod'])) {
            $validUrls[] = $webhook['webhook_url_prod'];
        }
    }
}

// Validation: Is the URL in the whitelist? Strict comparison avoids any
// PHP type-juggling surprises — both sides are already strings, but the
// whitelist check is security-critical so defense in depth is cheap.
if (!in_array($webhookUrl, $validUrls, true)) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Webhook URL not authorized'
    ]);
    exit;
}

// Send cURL request to webhook
$ch = curl_init($webhookUrl);
if ($ch === false) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to initialize cURL'
    ]);
    exit;
}

// Restrict to HTTP(S) only — blocks SSRF via file://, gopher://, ldap://, etc.
// PHP 8.3 deprecated the integer-bitmask CURLOPT_PROTOCOLS in favour of
// CURLOPT_PROTOCOLS_STR (string "http,https"). Use the modern constant
// when available so webhook fires don't emit E_DEPRECATED noise.
$protocolOpts = [];
if (defined('CURLOPT_PROTOCOLS_STR')) {
    $protocolOpts[CURLOPT_PROTOCOLS_STR] = 'http,https';
} else {
    $allowedProtocols = (defined('CURLPROTO_HTTP') ? CURLPROTO_HTTP : 1)
        | (defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2);
    $protocolOpts[CURLOPT_PROTOCOLS] = $allowedProtocols;
}

// Cap how much of the webhook response we'll buffer. We only care about
// the HTTP status code, not the body — but without a cap a malicious or
// broken target could return gigabytes and exhaust PHP memory.
$maxResponseBytes = 65536; // 64 KB
$bytesReceived = 0;

curl_setopt_array($ch, $protocolOpts + [
    // No CURLOPT_RETURNTRANSFER: CURLOPT_WRITEFUNCTION drives the body
    // handling instead, counting bytes and aborting on overflow.
    // Don't follow redirects. A compromised or misconfigured webhook
    // target could otherwise redirect the POST to internal metadata
    // endpoints (e.g. 169.254.169.254 on AWS) — classic SSRF. Legitimate
    // webhooks don't need HTTP redirects; if one does, update config.
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'User-Agent: TriggerForge/1.0'
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'triggered_at' => date('Y-m-d H:i:s'),
        'source' => 'TriggerForge'
    ]),
    CURLOPT_WRITEFUNCTION => function ($ch, $data) use (&$bytesReceived, $maxResponseBytes) {
        $bytesReceived += strlen($data);
        if ($bytesReceived > $maxResponseBytes) {
            return 0; // signal cURL to abort the transfer
        }
        return strlen($data);
    },
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Process response. We log the raw curl error server-side but only send a
// generic message to the client to avoid leaking internal details.
//
// Note: if the write-size cap aborted the transfer AFTER the HTTP status
// was already received, curl_error is set (e.g. "Failed writing body")
// but $httpCode reflects the real status. In that case the webhook
// actually fired successfully and we should honor the HTTP code.
if ($curlError && $httpCode === 0) {
    error_log('TriggerForge: webhook call failed - ' . $curlError);
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'message' => 'Upstream webhook could not be reached'
    ]);
    exit;
}

if ($httpCode >= 200 && $httpCode < 300) {
    echo json_encode([
        'success' => true,
        'message' => 'Webhook triggered successfully!',
        'http_code' => $httpCode
    ]);
} else {
    // Only forward recognized 4xx/5xx codes — otherwise map to 502 so PHP
    // never emits a nonsense status line to the client.
    $safeCode = ($httpCode >= 400 && $httpCode < 600) ? $httpCode : 502;
    http_response_code($safeCode);
    echo json_encode([
        'success' => false,
        'message' => 'Webhook call failed (HTTP ' . (int)$httpCode . ')',
        'http_code' => (int)$httpCode
    ]);
}
