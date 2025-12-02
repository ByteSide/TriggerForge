<?php
/**
 * TriggerForge - Webhook Trigger API
 * 
 * This script receives POST requests from the frontend and
 * triggers the configured webhooks server-side.
 */

// JSON Response Header
header('Content-Type: application/json');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Only POST requests allowed'
    ]);
    exit;
}

// Get webhook URL from POST data
$input = json_decode(file_get_contents('php://input'), true);
$webhookUrl = $input['webhook_url'] ?? '';

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

$config = require $configPath;
$validUrls = [];

// Collect all configured URLs (Test + Prod)
foreach ($config as $category => $webhooks) {
    foreach ($webhooks as $webhook) {
        if (isset($webhook['webhook_url_test'])) {
            $validUrls[] = $webhook['webhook_url_test'];
        }
        if (isset($webhook['webhook_url_prod'])) {
            $validUrls[] = $webhook['webhook_url_prod'];
        }
    }
}

// Validation: Is the URL in the whitelist?
if (!in_array($webhookUrl, $validUrls)) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Webhook URL not authorized'
    ]);
    exit;
}

// Send cURL request to webhook
$ch = curl_init($webhookUrl);

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'User-Agent: TriggerForge/1.0'
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'triggered_at' => date('Y-m-d H:i:s'),
        'source' => 'TriggerForge'
    ])
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Process response
if ($curlError) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Webhook call failed: ' . $curlError
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
    http_response_code($httpCode);
    echo json_encode([
        'success' => false,
        'message' => 'Webhook call failed (HTTP ' . $httpCode . ')',
        'http_code' => $httpCode
    ]);
}
