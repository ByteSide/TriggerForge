# TriggerForge

A sleek, secure dashboard for manually triggering webhooks with a single click.

![Version](https://img.shields.io/badge/version-1.0.0-FD7D00)
![License](https://img.shields.io/badge/license-MIT-015351)
![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4)
![Status](https://img.shields.io/badge/status-production-4ade80)

---

## Overview

TriggerForge is a lightweight, mobile-friendly web app that gives you a beautiful control panel for the webhooks you already use. Point it at any automation platform — [n8n](https://n8n.io), [Make](https://make.com), [Zapier](https://zapier.com), your own APIs — and fire workflows from your phone or desktop with a single tap.

No build step, no database, no npm dependencies. Upload the files, protect the directory with HTTP Basic Auth, add your webhook URLs to a PHP config file — done.

## Features

- **Password protection** via HTTP Basic Auth — credentials never leave your server
- **Mobile-first UI** with dark-theme glassmorphism and an interactive particle background
- **Installable as a PWA** on iOS and Android home screens
- **TEST/PROD toggle** to flip between staging and production webhook URLs at runtime
- **Favorites bar** for quick access to your most-used triggers (up to 10)
- **Custom links** alongside webhooks for dashboards, docs, or any external URL
- **Confirmation modal** before every trigger to prevent accidental fires
- **Cooldown timer** (10 s) to prevent double-triggers, with live progress indicator
- **Toast notifications** for success, error, warning and info feedback
- **Server-side proxy** — browsers never see your webhook URLs without authentication
- **URL whitelist** — the backend only forwards to pre-configured targets
- **Self-hosted fonts and icons** — no CDN dependencies, no analytics, no tracking
- **Reduced-motion support** — particle effects auto-disable for accessibility

## Requirements

- **PHP 7.4** or higher with the `curl` extension
- **Apache** with `mod_rewrite`, `mod_auth`, `mod_mime`, and `mod_headers` enabled
- **HTTPS** (strongly recommended — `.htaccess` forces a redirect)

No database, no build pipeline, no package manager required.

## Quick Start

### 1. Download

Clone the repository or download the ZIP:

```bash
git clone https://github.com/ByteSide/TriggerForge.git
```

### 2. Create your password file

Generate an `.htpasswd` file with HTTP Basic Auth credentials **locally** — never submit passwords to an online generator.

```bash
htpasswd -B -c .htpasswd yourusername
```

`-B` selects bcrypt (Apache 2.4+). If the `htpasswd` CLI is unavailable, fall back to a local PHP one-liner:

```bash
php -r 'echo "admin:".password_hash("your-secure-password", PASSWORD_BCRYPT)."\n";' > .htpasswd
```

### 3. Configure Apache

```bash
cp .htaccess.example .htaccess
```

Open `.htaccess` and update the `AuthUserFile` directive with the **absolute** server path to your `.htpasswd` file, for example:

```apache
AuthUserFile /home/username/public_html/triggerforge/.htpasswd
```

If you don't know the absolute path, look it up in your hosting control panel ("Document Root" / "Home Directory") or run `pwd` over SSH from inside the project directory. Avoid dropping a temporary `__DIR__` probe into the web root — a forgotten helper file leaks your server filesystem layout.

### 4. Add your webhooks

```bash
cp config/config.example.php config/config.php
```

Edit `config/config.php` with your own webhook URLs and custom links (see [Configuration](#configuration) below).

### 5. Upload and test

Upload everything to your server via FTP/SFTP, preserving the directory structure and including hidden files. Visit `https://yourdomain.com/triggerforge/`, log in, and trigger your first webhook.

For a detailed step-by-step deployment walkthrough see [DEPLOYMENT.md](DEPLOYMENT.md).
For the security-setup checklist see [SETUP_SECURITY.md](SETUP_SECURITY.md).

## Configuration

All buttons are defined in a single PHP array in `config/config.php`. Items are grouped into collapsible categories.

### Webhook button

```php
[
    'type'             => 'webhook',
    'name'             => 'Daily Report',
    'webhook_url_test' => 'https://your-n8n.cloud/webhook-test/abc123',
    'webhook_url_prod' => 'https://your-n8n.cloud/webhook/abc123',
    'description'      => 'Generates and sends the daily report',
]
```

| Field              | Required | Description                                           |
|--------------------|----------|-------------------------------------------------------|
| `type`             | no       | `'webhook'` (default) or `'link'`                     |
| `name`             | yes      | Displayed button label                                |
| `webhook_url_test` | yes      | URL fired while TEST mode is active                   |
| `webhook_url_prod` | yes      | URL fired while PROD mode is active                   |
| `description`      | no       | Tooltip text shown on hover                           |

### Custom link

```php
[
    'type'        => 'link',
    'name'        => 'Dashboard',
    'url'         => 'https://app.example.com/dashboard',
    'description' => 'Opens the admin dashboard',
]
```

Links open in a new tab. A favicon is fetched automatically from the target domain.

### Full example

```php
<?php
return [
    'Automation' => [
        [
            'type'             => 'webhook',
            'name'             => 'Daily Report',
            'webhook_url_test' => 'https://your-n8n.cloud/webhook-test/abc',
            'webhook_url_prod' => 'https://your-n8n.cloud/webhook/abc',
            'description'      => 'Generates and sends the daily report',
        ],
    ],
    'Tools' => [
        [
            'type'        => 'link',
            'name'        => 'n8n',
            'url'         => 'https://your-n8n.cloud',
            'description' => 'Open the n8n editor',
        ],
    ],
];
```

## Security

TriggerForge takes a defence-in-depth approach for a simple tool:

- **HTTP Basic Auth** via `.htaccess` guards every request before PHP even runs
- **Forced HTTPS** via a 301 redirect at the Apache layer
- **Server-side proxy** — the browser sends a URL reference to `api/trigger.php`, which validates it against the config before firing via cURL
- **URL whitelist** — only URLs listed in `config/config.php` can ever be triggered; any other URL is rejected with HTTP 403
- **Config file protection** — direct HTTP access to `config/config.php` is blocked
- **Security headers** — `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, and `X-XSS-Protection` are set by default
- **PWA asset exception** — only `.webmanifest`, `.png`, `.svg`, `.ico` files bypass auth so that mobile "Add to Home Screen" flows work

### Recommendations

- Use a strong, unique password for `.htpasswd`
- Use random, opaque webhook IDs on your automation platform
- Enable HTTPS (Let's Encrypt is free on most hosting providers)
- Keep `.htpasswd` outside the document root if your host allows it
- Rotate credentials periodically

## Mobile Installation (PWA)

### iOS (Safari)
1. Open TriggerForge in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

### Android (Chrome)
1. Open TriggerForge in Chrome
2. Tap the menu (three dots)
3. Select "Add to Home Screen"

The app is configured as a standalone PWA with portrait orientation and the TriggerForge theme color.

## Project Structure

```
triggerforge/
├── index.php                  # Main UI — renders HTML from config
├── api/
│   └── trigger.php            # Backend proxy — validates and forwards webhook calls
├── config/
│   └── config.example.php     # Template for your webhook/link configuration
├── assets/
│   ├── favicons/              # Favicons and PWA manifest
│   ├── fonts/                 # JetBrains Mono + Fira Code (self-hosted)
│   └── icons/                 # Boxicons (self-hosted)
├── css/
│   ├── bg.css                 # Backdrop gradient and particle canvas
│   └── style.css              # Design tokens, components, animations
├── js/
│   ├── app.js                 # State, favorites, cooldowns, modal, triggers
│   └── particles.js           # Canvas particle background with mouse interaction
├── .htaccess.example          # Apache template — auth, HTTPS, security headers
├── DEPLOYMENT.md               # FTP deployment guide
├── SETUP_SECURITY.md           # Security configuration guide
├── LICENSE                     # MIT
└── README.md
```

## Local Development

A local dev server ships with `package.json` for convenience:

```bash
npm start          # Unix / macOS
npm run start:win  # Windows
```

Or directly:

```bash
php -S localhost:8000
```

Then open `http://localhost:8000/`.

Note: the PHP built-in server does **not** evaluate `.htaccess`, so local runs are unauthenticated. Do not expose the dev port to a public network.

## Troubleshooting

| Symptom                        | Likely cause                                               |
|--------------------------------|------------------------------------------------------------|
| **500 Internal Server Error**  | Wrong or missing `AuthUserFile` path in `.htaccess`        |
| **Login dialog never appears** | `.htaccess` not uploaded, or `mod_auth` not enabled        |
| **Login rejected**             | Malformed `.htpasswd`, wrong file permissions (use 644)    |
| **Webhook returns 403**        | URL not exactly matching an entry in `config/config.php`   |
| **Webhook returns 5xx**        | Target service is down — test the URL with curl/Postman   |
| **Buttons not rendering**      | `config/config.php` missing or contains a PHP syntax error |

## License

[MIT](LICENSE) — free to use, modify, and distribute.

## Credits

Built by [ByteSide.io](https://byteside.io).

Fonts: [JetBrains Mono](https://www.jetbrains.com/lp/mono/), [Fira Code](https://github.com/tonsky/FiraCode).
Icons: [Boxicons](https://boxicons.com).
