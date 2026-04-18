# TriggerForge

A self-hosted, offline-capable dashboard for firing webhooks with a single click.

![Version](https://img.shields.io/badge/version-1.1.0-FD7D00)
![License](https://img.shields.io/badge/license-MIT-015351)
![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4)
![Status](https://img.shields.io/badge/status-production-4ade80)

---

## Overview

TriggerForge turns the webhooks you already use — n8n, Make, Zapier, IFTTT, Discord, Slack, your own REST APIs — into a mobile-friendly control panel you can pin to the home screen of any device. Write your URLs once in a PHP config file (or in the built-in web editor), protect the directory with HTTP Basic Auth, and every button is one tap away.

The app is installable as a PWA, works offline (with a queue that drains when you reconnect), and ships without a single npm dependency or build step. Upload the files, edit the config, done.

---

## Features

**Core**
- Single-click firing of any HTTP(S) webhook (POST/GET/PUT/PATCH/DELETE)
- Per-webhook **custom payload**, **custom HTTP headers**, **custom HTTP method**
- **Webhook chains** — run a sequence of webhooks with optional delays between steps
- **Undo window** — opt-in `undo_url` per webhook surfaces an "Undo" button in the success toast
- **TEST/PROD mode** with a visible banner and a diff-warning when a mode switch leaves some webhooks without a target URL
- **Per-webhook cooldown override** and **per-webhook confirm-skip** in config
- **Stable item IDs** — favorites and cooldowns survive config reordering when you assign an explicit `id`

**UI & UX**
- Dark, light, and auto themes with live switching and flash-prevention on load
- Six accent colors, compact/comfortable/spacious density, grid/list layout, adjustable text size
- Built-in **config editor** at `admin.php` — add / edit / duplicate / delete items and categories, no SSH required
- Config **import / export** as JSON with an auto-backup ring-buffer (`config/backups/`)
- **Search / filter** bar with `/` and `Ctrl+K` shortcuts
- **Favorites bar** (up to 10 pinned, drag-to-reorder, collapsible)
- **Keyboard shortcuts** — 1-9 fire favorites, `t` toggles mode, `?` shows the cheat sheet
- **Drag-to-reorder** within categories (HTML5 drag, desktop)
- **Hover preview** with redacted URL, last-fire timestamp, and total counter
- **Custom branding** — override app title, background image, per-category icons and colors

**Runtime visibility**
- **Response viewer** — pretty-printed upstream body (JSON auto-formatted), response headers, HTTP code, duration
- **History drawer** — ring-buffered last 50 fires with per-entry retry and details
- **Stats modal** — logged fires, success rate, average duration, most-fired top-10, recent errors
- **Copy as cURL** — reproduces the request so you can debug from the terminal

**PWA / offline**
- Installable on iOS, Android, and desktop browsers
- **Service worker** precaches the app shell and serves a navigation-first HTML strategy
- **Offline queue** (opt-in) captures fires when offline and drains them on reconnect
- **Pull-to-refresh** (opt-in, mobile)
- **Browser notifications** (opt-in) when a fire completes while the tab is backgrounded
- **Share target** — register TriggerForge as an OS share destination and pick a webhook to forward the shared data

**Accessibility**
- WCAG-friendly contrast, keyboard-accessible favorite stars, skip-to-content link
- ARIA live announcements for cooldown countdowns
- Reduced-motion and reduced-data support
- Focus trap on modals; drawer and floating bars inert when invisible

**Security**
- HTTP Basic Auth via `.htaccess` + `.htpasswd`
- Forced HTTPS redirect
- Strict CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- Server-side webhook **whitelist** — the browser POSTs a target URL, the backend only forwards if it matches an entry in `config.php`
- Custom payloads and headers live in config only; a rogue client cannot smuggle them
- Atomic config writes (tmp + rename) with automatic pre-write backups

---

## Requirements

- **PHP 7.4+** with the `curl` extension
- **Apache** with `mod_rewrite`, `mod_auth`, `mod_mime`, `mod_headers`
- **HTTPS** strongly recommended (`.htaccess` auto-redirects)

No database, no build pipeline, no package manager. Everything ships pre-built.

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/ByteSide/TriggerForge.git
```

### 2. Create your password file

Generate `.htpasswd` **locally** (never send passwords to an online service):

```bash
htpasswd -B -c .htpasswd yourusername
```

`-B` forces bcrypt. If `htpasswd` is not available, use the PHP fallback:

```bash
php -r 'echo "admin:".password_hash("your-secure-password", PASSWORD_BCRYPT)."\n";' > .htpasswd
```

### 3. Configure Apache

```bash
cp .htaccess.example .htaccess
```

Edit `.htaccess` and replace the placeholder `AuthUserFile /path/to/your/triggerforge/.htpasswd` with the **absolute** server path.

### 4. Add your webhooks

Two ways:

**Option A — file**: `cp config/config.example.php config/config.php` and edit.

**Option B — web editor**: upload first, then visit `https://yourdomain/triggerforge/admin.php` and use the UI.

### 5. Upload and test

FTP/SFTP the entire tree to your server (preserving hidden files). Visit `https://yourdomain/triggerforge/`, log in, and trigger your first webhook.

Full walkthrough in [DEPLOYMENT.md](DEPLOYMENT.md). Security checklist in [SETUP_SECURITY.md](SETUP_SECURITY.md).

---

## Configuration

All buttons are defined in `config/config.php`. The file returns one associative array where each top-level key is a category name and each value is a list of item objects.

### Webhook item

```php
[
    'type'             => 'webhook',
    'id'               => 'daily-report',          // optional, recommended — survives reordering
    'name'             => 'Daily Report',
    'icon'             => 'bx-calendar',           // optional, any Boxicon class
    'description'      => 'Runs the daily report', // optional tooltip
    'webhook_url_test' => 'https://n8n.example.com/webhook-test/abc',
    'webhook_url_prod' => 'https://n8n.example.com/webhook/abc',
    'cooldown'         => 30000,                   // optional ms; 0 = disabled
    'confirm'          => false,                   // optional; skip "Ready to fire?" modal
    'method'           => 'PUT',                   // optional GET/POST/PUT/PATCH/DELETE
    'headers'          => ['Authorization' => 'Bearer …'], // optional
    'payload'          => ['env' => 'prod', 'channel' => '#ops'], // optional
    'undo_url'         => 'https://n8n.example.com/webhook/abc-undo', // optional
]
```

| Field              | Required | Description |
|--------------------|----------|-------------|
| `type`             | no       | `'webhook'` (default), `'link'`, or `'chain'` |
| `id`               | no       | Stable identifier (A-Za-z0-9_-). **Recommended** — favorites/cooldowns key off it |
| `name`             | yes      | Button label |
| `webhook_url_test` | yes      | URL fired in TEST mode |
| `webhook_url_prod` | yes      | URL fired in PROD mode |
| `icon`             | no       | Boxicon class (e.g. `bx-envelope`, `bxl-slack`); default `bx-bolt` |
| `description`      | no       | Tooltip (and used in the hover preview) |
| `cooldown`         | no       | Per-button cooldown in ms (0-3 600 000). Default 10 000; 0 disables |
| `confirm`          | no       | `false` skips the confirmation modal |
| `method`           | no       | HTTP method; default POST |
| `headers`          | no       | Additional request headers (string => string) |
| `payload`          | no       | Extra JSON keys merged into the outbound body |
| `undo_url`         | no       | Surfaces an "Undo" toast action; whitelisted alongside the main URLs |

### Link item

```php
[
    'type' => 'link',
    'id'   => 'dashboard',        // optional
    'name' => 'Dashboard',
    'icon' => 'bx-folder-open',   // optional; overrides the auto-fetched favicon
    'url'  => 'https://app.example.com/dashboard',
    'description' => 'Opens the admin dashboard',
]
```

Links open in a new tab. A favicon is fetched from `https://www.google.com/s2/favicons` unless an explicit `icon` is set (useful if you don't want the Google pingback).

### Chain item

Runs a sequence of webhook items. Each step references another item's `id`.

```php
[
    'type'  => 'chain',
    'id'    => 'deploy-sequence',
    'name'  => 'Deploy → Notify',
    'icon'  => 'bx-git-branch',
    'steps' => [
        ['ref' => 'build-start'],
        ['ref' => 'wait-for-ci', 'delayMs' => 30000],
        ['ref' => 'notify-team'],
    ],
]
```

`delayMs` is the pause **after** each step completes. The chain confirmation modal lists every referenced target and flags missing ones.

### Category metadata

Reserved `_meta` key on a category value. Skipped by the item iterator.

```php
'Critical' => [
    '_meta' => [
        'icon'  => 'bx-alarm',   // Boxicon class for the category header
        'color' => '#ef4444',    // hex accent; used for the header's left border
    ],
    [ 'type' => 'webhook', … ],
]
```

### App-level branding

Reserved top-level `_app` key.

```php
return [
    '_app' => [
        'title' => 'Acme Operations',        // <title> + header text (<= 64 chars)
        'background_image' => 'assets/bg.jpg', // URL or relative assets/ path
    ],
    'Automation' => [ … ],
];
```

### Template gallery

`config/config.example.php` ships with commented templates for **Slack, Discord, Microsoft Teams, IFTTT, Zapier, generic REST with auth, and no-confirm pings**. Copy-paste the block you need, replace the URL, uncomment.

### Schema

`config/config.schema.json` is a JSON Schema (Draft 2020-12) describing the whole config shape. IDEs use it for autocomplete against a JSON representation. The CLI validator reads it too.

### Validator

```bash
php lib/validate-config.php
```

Exits 0 on OK, 1 on validation errors, 2 on infra errors. Used by `api/import.php` and `admin.php` before writing.

---

## Config editor (admin.php)

Visit `https://yourdomain/triggerforge/admin.php` (Basic-Auth-gated same as the main app). The editor lets you:

- Add / rename / delete categories
- Add / edit / duplicate / delete items (webhook, link, chain)
- Inline-edit common fields (name, id, URLs)
- Toggle a `<details>` block for advanced fields (icon, description, cooldown, confirm, method, headers JSON, payload JSON)
- **Save** → validates + backs up the current config to `config/backups/config.<ts>.php.bak` (ring-buffer of 10) + atomically writes

Validation errors surface in a modal; a broken config is never written.

---

## Keyboard shortcuts

Press `?` inside the app for a live cheat sheet. Quick reference:

| Key            | Action                                                    |
|----------------|-----------------------------------------------------------|
| `/` or `Ctrl+K`| Focus the search bar                                      |
| `1` – `9`      | Fire favorite #N (goes through the confirm flow)          |
| `t`            | Toggle TEST / PROD mode                                   |
| `?`            | Show the keyboard cheat sheet                             |
| `Esc`          | Close modal / drawer, or clear the search input           |
| Shift + click  | Add a webhook to the bulk-fire selection                  |
| Drag           | Reorder within a category / in the favorites bar (desktop)|

---

## Settings

The gear icon (top right of the header) opens a Settings modal with:

**Appearance** — theme (Auto/Dark/Light), accent color (6 presets), density, layout (grid/list), text size, background particles preset (Standard/Minimal/Off).

**Behavior** — sort order (Config/A-Z/Recent/Top), show "last triggered" timestamps, show trigger-count badges, haptic feedback, pull-to-refresh, offline queue, browser notifications.

**App** — "Install as app" button (shown only when the browser reports the PWA is installable).

**Data** — open config editor, export config (JSON download), import config (file picker), reset look-and-feel to defaults.

All settings persist in localStorage under `triggerforge_settings`. The **Reset** action only clears settings — favorites, cooldowns, and history are kept.

---

## History, Stats, Bulk-fire, Share-target

**History** — bookmark-icon button in the header opens a slide-in drawer with the last 50 fires. Each row shows timestamp, mode, HTTP code, duration; rows offer Retry (back through the normal confirm flow) and Details (opens the response viewer).

**Stats** — the `Stats` action inside the history drawer opens a modal with: total fires logged, success rate, average duration, top-10 most-fired list (with bar chart), and the last 5 errors.

**Bulk fire** — Shift-click on webhook buttons builds a multi-selection. A floating bottom bar appears with Clear and "Fire all" actions. Fire-all shows ONE confirmation listing every selected webhook, then fires them sequentially (respecting cooldown; skipped items show up in the completion toast).

**Share target** — once installed as a PWA, TriggerForge shows up in the OS share sheet. Shared title/text/url land in a picker modal; pick a webhook and the shared data is forwarded under a `shared` key in the outbound payload (limited to 2 KB per field by the backend).

---

## Security

**Defence in depth:**

- HTTP Basic Auth on every request (Apache evaluates before PHP runs)
- Forced HTTPS via 301 redirect
- Strict `Content-Security-Policy` (`script-src 'self'` — no inline scripts)
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: …`
- Server-side whitelist: the browser POSTs `{ webhook_url: '…' }` to `api/trigger.php`; the backend only forwards if the URL matches one configured in `config.php`
- JSON-only API: `api/trigger.php`, `api/import.php` require `Content-Type: application/json`, blocking text/plain CSRF via cross-site forms
- Custom payloads / methods / headers are **config-only** — a client cannot inject its own
- Upstream-reachable URLs are whitelisted via `CURLOPT_PROTOCOLS` = http/https; redirects disabled to prevent SSRF into cloud-metadata endpoints
- Atomic config writes with pre-write backups so a crashed write cannot leave a partial file
- Optional **IP allowlist** pattern in [SETUP_SECURITY.md](SETUP_SECURITY.md)

**Recommendations:**

- Use bcrypt (`-B`) for `.htpasswd`; set file permissions to `600`
- Use opaque random webhook IDs upstream
- Rotate credentials periodically
- Layer an IP allowlist if the dashboard only needs to be reachable from known networks

---

## Mobile / PWA installation

Once installed, the app runs full-screen and starts offline (cached app shell).

**iOS (Safari)** — Share button → "Add to Home Screen".
**Android (Chrome)** — three-dot menu → "Add to Home Screen" (or tap the Install button the browser offers).
**Desktop (Chrome / Edge)** — browser URL bar install icon, or the **Install as app** button in TriggerForge's Settings > App section.

### Offline queue

Enable **Settings > Behavior > Queue fires when offline**. While offline, fires are stashed in `localStorage` (capped at 100). On the next `online` event they drain sequentially through `api/trigger.php`. Fires that return 4xx/5xx are removed from the queue; genuine network failures stay queued for the next attempt.

### Service worker

`sw.js` precaches the app shell (HTML, CSS, JS, fonts, icons, favicons). Static assets use stale-while-revalidate; navigation (HTML) is network-first so deploys are seen immediately when online. API endpoints bypass the cache entirely. A **New version available** toast appears when an update is ready; clicking Reload swaps in the new worker.

---

## Project layout

```
triggerforge/
├── index.php                # main UI
├── admin.php                # config editor UI
├── sw.js                    # service worker
├── api/
│   ├── trigger.php          # whitelisted webhook proxy
│   ├── import.php           # config write (validate + backup + atomic)
│   └── export.php           # config download (JSON)
├── lib/
│   ├── render.php           # PHP button / category render helpers
│   ├── validate-config.php  # config validator (CLI + reusable function)
│   └── version.php          # git describe → package.json → fallback
├── config/
│   ├── config.example.php   # template + commented preset gallery
│   ├── config.schema.json   # JSON Schema (Draft 2020-12)
│   └── backups/             # auto-created ring-buffer of 10 prior configs
├── assets/
│   ├── favicons/            # favicons + site.webmanifest (with share_target)
│   ├── fonts/               # JetBrains Mono + Fira Code (self-hosted)
│   └── icons/boxicons/      # Boxicons (self-hosted)
├── css/
│   ├── bg.css               # backdrop gradient + optional background image
│   ├── style.css            # design tokens, components, animations
│   └── admin.css            # config-editor-specific styles
├── js/
│   ├── app.js               # all application logic
│   ├── admin.js             # config-editor logic
│   ├── particles.js         # canvas particle background
│   └── theme-preload.js     # head-loaded theme flash prevention
├── .htaccess.example        # Apache template
├── DEPLOYMENT.md            # deployment walkthrough
├── SETUP_SECURITY.md        # security + IP allowlist checklist
└── README.md
```

---

## Local development

```bash
npm start            # Unix / macOS — wraps `php -S localhost:8000`
npm run start:win    # Windows
```

Or directly:

```bash
php -S localhost:8000
```

The built-in PHP server does **not** evaluate `.htaccess`, so local runs are unauthenticated. Do not expose the dev port on a public network.

**Test the validator:**

```bash
php lib/validate-config.php            # validates config/config.php
php lib/validate-config.php path.php   # validates the given file
```

---

## Troubleshooting

| Symptom                           | Likely cause                                                       |
|-----------------------------------|--------------------------------------------------------------------|
| **500 Internal Server Error**     | Wrong / missing `AuthUserFile` path in `.htaccess`                 |
| **Login dialog never appears**    | `.htaccess` not uploaded, or `mod_auth` not enabled                |
| **Login rejected**                | Malformed `.htpasswd`, wrong file permissions                      |
| **Webhook returns 403**           | URL not exactly matching an entry in `config/config.php`           |
| **Webhook returns 5xx**           | Target service down — test the URL with curl/Postman               |
| **Buttons not rendering**         | `config/config.php` missing or contains a PHP syntax error         |
| **Config editor won't save**      | Validator rejected the change (errors shown in modal) OR `config/` not writable on the server |
| **Theme flashes on load**         | `js/theme-preload.js` blocked or not uploaded                      |
| **Install button missing**        | Browser doesn't consider the app installable yet (revisit later)   |
| **Offline queue not draining**    | Feature disabled in Settings, or the browser hasn't fired `online` |

---

## Changelog & releases

See [CHANGELOG.md](CHANGELOG.md) for the full version history, upgrade
notes, and breaking changes. Tagged releases live at
[github.com/ByteSide/TriggerForge/releases](https://github.com/ByteSide/TriggerForge/releases).

## Security

Security issues should be reported privately — see
[SECURITY.md](SECURITY.md) for the disclosure process and what's in
scope.

## License

[MIT](LICENSE) — free to use, modify, and distribute.

## Credits

Built by [ByteSide.io](https://byteside.io).

Fonts: [JetBrains Mono](https://www.jetbrains.com/lp/mono/), [Fira Code](https://github.com/tonsky/FiraCode).
Icons: [Boxicons](https://boxicons.com).
