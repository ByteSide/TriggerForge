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
// Build a URL -> config-item map. We need the full item (not just its
// URLs) so we can honour per-webhook overrides (payload, method, headers).
// If the same URL is reused across items, later entries win — operator
// error either way; keep behaviour deterministic.
//
// Keys starting with '_' are reserved metadata (e.g. '_meta' for a
// category icon/color) and must not contribute to the whitelist —
// otherwise a mistake like '_meta' => ['webhook_url_prod' => '...']
// would silently authorise a URL.
$urlToItem = [];
foreach ($config as $category => $webhooks) {
    // Top-level '_app', '_meta' etc. are reserved metadata, not categories.
    if (is_string($category) && strlen($category) > 0 && $category[0] === '_') {
        continue;
    }
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
            $urlToItem[$webhook['webhook_url_test']] = $webhook;
        }
        if (isset($webhook['webhook_url_prod']) && is_string($webhook['webhook_url_prod'])) {
            $urlToItem[$webhook['webhook_url_prod']] = $webhook;
        }
        // Undo URL: whitelist it too so the client's "Undo" toast button
        // can POST to it via the same endpoint. The undo call uses the
        // default minimal payload (no item payload/method/headers
        // overrides) — semantically an undo is a separate action, not a
        // copy of the main fire.
        if (isset($webhook['undo_url']) && is_string($webhook['undo_url'])) {
            $urlToItem[$webhook['undo_url']] = [
                'type' => 'webhook',
                'name' => (isset($webhook['name']) ? $webhook['name'] : 'Undo') . ' (undo)',
            ];
        }
    }
}

// Validation: Is the URL in the whitelist? Strict key lookup avoids any
// PHP type-juggling surprises — both sides are already strings, but the
// whitelist check is security-critical so defense in depth is cheap.
if (!array_key_exists($webhookUrl, $urlToItem)) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Webhook URL not authorized'
    ]);
    exit;
}
$matchedItem = $urlToItem[$webhookUrl];

// Optional share-target pass-through: the PWA flow lands on index.php
// with shared_{title,text,url} query params, and the picker sends them
// via this field. Everything else in $input is ignored.
$shared = null;
if (isset($input['shared']) && is_array($input['shared'])) {
    $shared = [];
    foreach (['title', 'text', 'url'] as $sk) {
        if (isset($input['shared'][$sk]) && is_string($input['shared'][$sk])) {
            // Hard-cap at 2 KB per field so a huge paste can't balloon
            // the outbound body past what the upstream is willing to
            // accept.
            $v = substr($input['shared'][$sk], 0, 2048);
            if ($v !== '') $shared[$sk] = $v;
        }
    }
    if (empty($shared)) $shared = null;
}

/**
 * Build the outbound JSON body for a matched config item. Default keys
 * (triggered_at, source, triggered_by) are always present; a per-item
 * 'payload' array merges on top and wins on key collisions.
 *
 * Payload lives in config — never in the client request — so a rogue
 * client can't smuggle their own body to a whitelisted URL.
 *
 * EXCEPTION: $shared is the narrow pass-through used by the PWA
 * share-target flow. Its shape is strictly validated upstream (only
 * string fields: title/text/url, each capped). It's added under a
 * single 'shared' namespace so upstream workflows can opt in without
 * colliding with regular payload keys.
 */
function tf_build_payload(array $item, $shared = null) {
    $base = [
        'triggered_at' => date('c'),
        'source'       => 'TriggerForge',
        'triggered_by' => isset($_SERVER['PHP_AUTH_USER']) ? $_SERVER['PHP_AUTH_USER'] : 'anonymous',
    ];
    if (is_array($shared) && !empty($shared)) {
        $base['shared'] = $shared;
    }
    if (isset($item['payload']) && is_array($item['payload'])) {
        return array_merge($base, $item['payload']);
    }
    return $base;
}

/**
 * Resolve the HTTP method for a config item. Whitelisted to prevent an
 * operator typo (`'method' => 'CONNECT'`) from producing strange cURL
 * behaviour. Anything else falls back to POST.
 */
function tf_resolve_method(array $item) {
    if (!isset($item['method']) || !is_string($item['method'])) return 'POST';
    $m = strtoupper(trim($item['method']));
    return in_array($m, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true) ? $m : 'POST';
}

/**
 * Build the CURLOPT_HTTPHEADER array for a matched config item. Starts
 * with the project defaults (User-Agent + Content-Type for body-bearing
 * methods), then layers per-item 'headers' on top. User-provided
 * headers overwrite defaults of the same name. Host / Content-Length
 * are always dropped — cURL manages them.
 */
function tf_build_headers(array $item, $method) {
    require_once __DIR__ . '/../lib/version.php';
    $defaults = ['User-Agent: TriggerForge/' . tf_version() . ' (+https://byteside.io)'];
    if ($method !== 'GET') {
        $defaults[] = 'Content-Type: application/json';
    }
    if (!isset($item['headers']) || !is_array($item['headers'])) {
        return $defaults;
    }
    $blocked = ['host', 'content-length'];
    $result = $defaults;
    foreach ($item['headers'] as $name => $value) {
        if (!is_string($name) || !is_string($value)) continue;
        $trimmedName = trim($name);
        if ($trimmedName === '') continue;
        $lname = strtolower($trimmedName);
        if (in_array($lname, $blocked, true)) continue;
        // Drop any default with the same header name so the user's
        // override takes effect instead of stacking two copies.
        $result = array_values(array_filter($result, function ($h) use ($lname) {
            $pos = strpos($h, ':');
            return $pos === false || strtolower(trim(substr($h, 0, $pos))) !== $lname;
        }));
        $result[] = $trimmedName . ': ' . trim($value);
    }
    return $result;
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

// Cap how much of the webhook response we'll buffer. Enough to show the
// user a meaningful response snippet in the details viewer while still
// capping memory against an abusive target returning gigabytes.
$maxResponseBytes = 65536; // 64 KB
$bytesReceived = 0;
$responseBody = '';
$responseHeaders = [];

// Resolve per-item overrides (HTTP method + headers). GET bodies are
// allowed by the spec but nonsensical for webhooks — we skip the body
// entirely for GET so we don't send a Content-Length + JSON envelope
// an upstream likely doesn't parse.
$method = tf_resolve_method($matchedItem);
$httpHeaders = tf_build_headers($matchedItem, $method);
$postBody = $method === 'GET' ? null : json_encode(tf_build_payload($matchedItem, $shared));

$methodOpts = [];
if ($method === 'POST') {
    $methodOpts[CURLOPT_POST] = true;
    $methodOpts[CURLOPT_POSTFIELDS] = $postBody;
} elseif ($method !== 'GET') {
    // PUT / PATCH / DELETE
    $methodOpts[CURLOPT_CUSTOMREQUEST] = $method;
    $methodOpts[CURLOPT_POSTFIELDS] = $postBody;
} else {
    // GET — explicit just to overwrite any default POST behaviour.
    $methodOpts[CURLOPT_CUSTOMREQUEST] = 'GET';
}

curl_setopt_array($ch, $protocolOpts + $methodOpts + [
    // No CURLOPT_RETURNTRANSFER: CURLOPT_WRITEFUNCTION drives the body
    // handling instead, counting bytes and aborting on overflow.
    // Don't follow redirects. A compromised or misconfigured webhook
    // target could otherwise redirect the POST to internal metadata
    // endpoints (e.g. 169.254.169.254 on AWS) — classic SSRF. Legitimate
    // webhooks don't need HTTP redirects; if one does, update config.
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => $httpHeaders,
    CURLOPT_WRITEFUNCTION => function ($ch, $data) use (&$bytesReceived, &$responseBody, $maxResponseBytes) {
        $bytesReceived += strlen($data);
        if ($bytesReceived > $maxResponseBytes) {
            // Truncate the final chunk at the cap so the response body we
            // do expose stays under the limit.
            $allowed = $maxResponseBytes - ($bytesReceived - strlen($data));
            if ($allowed > 0) {
                $responseBody .= substr($data, 0, $allowed);
            }
            return 0; // signal cURL to abort the transfer
        }
        $responseBody .= $data;
        return strlen($data);
    },
    CURLOPT_HEADERFUNCTION => function ($ch, $header) use (&$responseHeaders) {
        $len = strlen($header);
        $trimmed = trim($header);
        if ($trimmed === '') return $len;
        // First line is "HTTP/x.y 200 OK" — not a header, skip.
        if (stripos($trimmed, 'HTTP/') === 0) return $len;
        $colonPos = strpos($trimmed, ':');
        if ($colonPos === false) return $len;
        $name = strtolower(trim(substr($trimmed, 0, $colonPos)));
        $value = trim(substr($trimmed, $colonPos + 1));
        $responseHeaders[$name] = $value;
        return $len;
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

// Build a response envelope that always carries the detail payload the
// client's response viewer can render. JSON_INVALID_UTF8_SUBSTITUTE so a
// binary or mis-encoded upstream body doesn't break json_encode().
$detail = [
    'http_code' => (int)$httpCode,
    'response_body' => $responseBody,
    'response_headers' => $responseHeaders,
    'response_content_type' => isset($responseHeaders['content-type']) ? $responseHeaders['content-type'] : '',
    'response_bytes' => $bytesReceived,
    'response_truncated' => $bytesReceived > $maxResponseBytes,
];

if ($httpCode >= 200 && $httpCode < 300) {
    echo json_encode(array_merge([
        'success' => true,
        'message' => 'Webhook triggered successfully!',
    ], $detail), JSON_INVALID_UTF8_SUBSTITUTE);
} else {
    // Only forward recognized 4xx/5xx codes — otherwise map to 502 so PHP
    // never emits a nonsense status line to the client.
    $safeCode = ($httpCode >= 400 && $httpCode < 600) ? $httpCode : 502;
    http_response_code($safeCode);
    echo json_encode(array_merge([
        'success' => false,
        'message' => 'Webhook call failed (HTTP ' . (int)$httpCode . ')',
    ], $detail), JSON_INVALID_UTF8_SUBSTITUTE);
}
