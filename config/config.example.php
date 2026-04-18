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
 *     'icon' => 'bx-envelope',                 // optional. Any Boxicon class
 *                                              // name (https://boxicons.com/).
 *                                              // Default 'bx-bolt'.
 *     'cooldown' => 60000,                     // optional. Milliseconds after
 *                                              // firing before this button is
 *                                              // clickable again. 0 disables.
 *                                              // Default: 10000 (global).
 *     'confirm' => false,                      // optional. Skip the "Ready to
 *                                              // fire?" modal for low-risk
 *                                              // endpoints. Default: true.
 *     'payload' => ['env' => 'prod',           // optional. Extra JSON keys
 *                   'channel' => '#ops'],       // merged into the outbound
 *                                              // body alongside the default
 *                                              // triggered_at / source /
 *                                              // triggered_by. Config values
 *                                              // win on key collision.
 *     'method' => 'PUT',                       // optional. HTTP method used.
 *                                              // One of GET/POST/PUT/PATCH/
 *                                              // DELETE. Default: POST.
 *     'headers' => [                           // optional. Extra headers
 *         'Authorization' => 'Bearer XYZ',     // merged with default
 *         'X-Source' => 'dashboard',           // User-Agent/Content-Type.
 *     ],                                       // Host/Content-Length blocked.
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
 *     'icon' => 'bx-folder-open',              // optional. Overrides the
 *                                              // auto-fetched favicon with a
 *                                              // Boxicon. Useful when you
 *                                              // don't want the Google
 *                                              // favicon service pinged.
 *     'url' => 'https://example.com/page',
 *     'description' => 'Optional: Description of the link'
 * ]
 *
 * Structure for Webhook Chains:
 * [
 *     'type' => 'chain',
 *     'id'   => 'deploy-sequence',
 *     'name' => 'Deploy → Notify',
 *     'icon' => 'bx-git-branch',
 *     'steps' => [                             // fires each referenced webhook
 *         ['ref' => 'build-start'],             // in order, optionally waiting
 *         ['ref' => 'wait-for-ci',              // 'delayMs' ms after each step
 *          'delayMs' => 30000],                 // before starting the next
 *         ['ref' => 'notify-team'],
 *     ],
 * ]
 */

return [
    // =========================================
    // Optional: app-level branding. Reserved top-level key, skipped by
    // both the category iterator and the URL whitelist collector.
    // =========================================
    // '_app' => [
    //     'title' => 'Acme Operations',          // <title> + header logo text
    //     'background_image' => 'assets/my-bg.jpg', // URL or relative asset path
    // ],

    // =========================================
    // n8n Webhooks Example
    // =========================================
    'Automation' => [
        // Optional per-category metadata. The '_meta' key is reserved and
        // skipped during item iteration.
        //   '_meta' => [
        //       'icon'  => 'bx-cog',           // Boxicon class for the category header
        //       'color' => '#ef4444',          // hex accent for the left border
        //   ],
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

/* =========================================================================
 * TEMPLATE GALLERY — copy a snippet above, replace the URL / text, uncomment.
 * =========================================================================
 *
 * --- Slack Incoming Webhook ------------------------------------------------
 * [
 *     'type' => 'webhook',
 *     'id'   => 'slack-deploy',
 *     'name' => 'Post to #deploys',
 *     'icon' => 'bxl-slack',
 *     'webhook_url_test' => 'https://hooks.slack.com/services/T00/B00/TEST',
 *     'webhook_url_prod' => 'https://hooks.slack.com/services/T00/B00/PROD',
 *     'payload' => [
 *         'text'    => ':rocket: Manual deploy triggered from TriggerForge',
 *         'channel' => '#deploys',
 *     ],
 * ]
 *
 * --- Discord Webhook -------------------------------------------------------
 * [
 *     'type' => 'webhook',
 *     'id'   => 'discord-ops',
 *     'name' => 'Ping Ops channel',
 *     'icon' => 'bxl-discord-alt',
 *     'webhook_url_test' => 'https://discord.com/api/webhooks/.../testtoken',
 *     'webhook_url_prod' => 'https://discord.com/api/webhooks/.../prodtoken',
 *     'payload' => [
 *         'content'  => 'Manual ping from TriggerForge',
 *         'username' => 'TriggerForge',
 *     ],
 * ]
 *
 * --- Microsoft Teams Incoming Webhook --------------------------------------
 * [
 *     'type' => 'webhook',
 *     'id'   => 'teams-alert',
 *     'name' => 'Teams: Alert channel',
 *     'icon' => 'bxl-microsoft-teams',
 *     'webhook_url_test' => 'https://outlook.office.com/webhook/.../test',
 *     'webhook_url_prod' => 'https://outlook.office.com/webhook/.../prod',
 *     'payload' => [
 *         '@type'    => 'MessageCard',
 *         '@context' => 'http://schema.org/extensions',
 *         'title'    => 'TriggerForge',
 *         'text'     => 'Manual trigger fired',
 *     ],
 * ]
 *
 * --- IFTTT Maker Webhook ---------------------------------------------------
 * [
 *     'type' => 'webhook',
 *     'id'   => 'ifttt-lights',
 *     'name' => 'Living room lights',
 *     'icon' => 'bx-bulb',
 *     'webhook_url_test' => 'https://maker.ifttt.com/trigger/EVENT/with/key/TESTKEY',
 *     'webhook_url_prod' => 'https://maker.ifttt.com/trigger/EVENT/with/key/PRODKEY',
 *     'payload' => ['value1' => 'on'],
 * ]
 *
 * --- Generic REST with auth ------------------------------------------------
 * [
 *     'type' => 'webhook',
 *     'id'   => 'rest-create',
 *     'name' => 'Create resource',
 *     'method' => 'POST',
 *     'headers' => [
 *         'Authorization' => 'Bearer YOUR_TOKEN',
 *         'Accept'        => 'application/json',
 *     ],
 *     'payload' => ['kind' => 'manual'],
 *     'webhook_url_test' => 'https://api.example.com/v1/resource?env=test',
 *     'webhook_url_prod' => 'https://api.example.com/v1/resource',
 *     'cooldown' => 30000,
 * ]
 *
 * --- Quick, no-confirm ping ------------------------------------------------
 * [
 *     'type' => 'webhook',
 *     'id'   => 'status-ping',
 *     'name' => 'Ping status endpoint',
 *     'icon' => 'bx-pulse',
 *     'confirm' => false,            // fires without "Ready to fire?" modal
 *     'cooldown' => 0,               // no cooldown on rapid-fire pings
 *     'webhook_url_test' => 'https://status.example.com/ping',
 *     'webhook_url_prod' => 'https://status.example.com/ping',
 * ]
 *
 * --- Zapier Catch Hook -----------------------------------------------------
 * [
 *     'type' => 'webhook',
 *     'id'   => 'zapier-flow',
 *     'name' => 'Start Zapier flow',
 *     'icon' => 'bxl-zap',          // (or 'bx-zap')
 *     'webhook_url_test' => 'https://hooks.zapier.com/hooks/catch/ACCT/TEST/',
 *     'webhook_url_prod' => 'https://hooks.zapier.com/hooks/catch/ACCT/PROD/',
 * ]
 *
 * =========================================================================
 */
