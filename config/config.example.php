<?php
/**
 * TriggerForge - Webhook & Custom Links Configuration
 * 
 * Copy this file to config.php and add your own webhooks.
 * Supports ANY webhook URL - n8n, Make, Zapier, custom APIs, etc.
 * 
 * Structure for Webhooks:
 * [
 *     'type' => 'webhook',
 *     'id'   => 'daily-report',                // optional, recommended. Stable
 *                                              // identifier that survives
 *                                              // reordering. Allowed chars:
 *                                              // A-Z, a-z, 0-9, _, -.
 *                                              // Without 'id', items get a
 *                                              // positional id like
 *                                              // "category-3" which changes
 *                                              // when you add/remove items.
 *     'name' => 'Button Label',
 *     'webhook_url_test' => 'https://your-automation.com/webhook-test/unique-id',
 *     'webhook_url_prod' => 'https://your-automation.com/webhook/unique-id',
 *     'description' => 'Optional: What this webhook does'
 * ]
 *
 * Structure for Custom Links:
 * [
 *     'type' => 'link',
 *     'id'   => 'dashboard',                   // optional, same semantics as above
 *     'name' => 'Link Label',
 *     'url' => 'https://example.com/page',
 *     'description' => 'Optional: Description of the link'
 * ]
 */

return [
    // =========================================
    // n8n Webhooks Example
    // =========================================
    'Automation' => [
        [
            'type' => 'webhook',
            'name' => 'Daily Report',
            'webhook_url_test' => 'https://your-n8n.cloud/webhook-test/abc123',
            'webhook_url_prod' => 'https://your-n8n.cloud/webhook/abc123',
            'description' => 'Generates and sends daily report'
        ],
        [
            'type' => 'webhook',
            'name' => 'Sync Data',
            'webhook_url_test' => 'https://your-n8n.cloud/webhook-test/def456',
            'webhook_url_prod' => 'https://your-n8n.cloud/webhook/def456',
            'description' => 'Syncs data between systems'
        ]
    ],

    // =========================================
    // Zapier / Make (Integromat) Examples
    // =========================================
    'Integrations' => [
        [
            'type' => 'webhook',
            'name' => 'Zapier Workflow',
            'webhook_url_test' => 'https://hooks.zapier.com/hooks/catch/123456/test/',
            'webhook_url_prod' => 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
            'description' => 'Triggers Zapier automation'
        ],
        [
            'type' => 'webhook',
            'name' => 'Make Scenario',
            'webhook_url_test' => 'https://hook.eu1.make.com/testwebhook123',
            'webhook_url_prod' => 'https://hook.eu1.make.com/prodwebhook456',
            'description' => 'Triggers Make.com scenario'
        ]
    ],

    // =========================================
    // Mixed: Webhooks + Custom Links
    // =========================================
    'Tools & Resources' => [
        [
            'type' => 'webhook',
            'name' => 'Custom API Call',
            'webhook_url_test' => 'https://api.example.com/webhook/test',
            'webhook_url_prod' => 'https://api.example.com/webhook/trigger',
            'description' => 'Calls your custom API endpoint'
        ],
        [
            'type' => 'link',
            'name' => 'Dashboard',
            'url' => 'https://app.example.com/dashboard',
            'description' => 'Opens main dashboard'
        ],
        [
            'type' => 'link',
            'name' => 'Documentation',
            'url' => 'https://docs.example.com',
            'description' => 'Project documentation'
        ]
    ]
];

