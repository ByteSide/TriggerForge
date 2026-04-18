# Changelog

All notable changes to TriggerForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-04-18

Large feature release: full config editor, trigger history, stats, chains,
bulk-fire, rich response viewer, service worker, offline queue, share-target,
theme system, and a stack of security / accessibility / robustness fixes.

### Added

**Config editing**
- **Web-based config editor** at `admin.php` — add / rename / delete
  categories, CRUD items (webhook, link, chain) with inline basic fields
  and an `<details>` block for advanced fields (icon, cooldown, confirm,
  method, headers JSON, payload JSON).
- **JSON import / export** (`api/import.php`, `api/export.php`) with an
  auto-backup ring-buffer at `config/backups/config.<ts>.php.bak` (10
  most recent) and atomic writes (tmp + rename).
- **CLI validator** (`lib/validate-config.php`) — exits 0 OK, 1 on
  validation errors, 2 on infra errors. Reused by the import endpoint.
- **JSON schema** (`config/config.schema.json`, Draft 2020-12).

**Per-item fields**
- `id` — stable identifier so favorites/cooldowns survive reordering.
- `icon` — any Boxicon class, for both webhook and link items.
- `cooldown` — per-webhook override of the 10 s default (0 = disabled,
  capped at 1 hour).
- `confirm` — `false` skips the "Ready to fire?" modal.
- `payload` — extra JSON keys merged into the outbound body (config-only,
  never accepted from the client).
- `method` — HTTP method whitelist (GET / POST / PUT / PATCH / DELETE).
- `headers` — extra request headers (config-only).
- `undo_url` — surfaces an "Undo" action on the success toast.

**Per-category / app-level metadata**
- `_meta.icon` / `_meta.color` per category for custom accent.
- Top-level `_app.title` (overrides `<title>` and header, capped at 64 chars).
- Top-level `_app.background_image` (URL or relative `assets/` path, with
  a strict allow-list to prevent CSS injection).

**Item type**
- **Chains** (`type: 'chain'`) — run a sequence of referenced webhooks
  with optional `delayMs` between steps.

**UI**
- Central **Settings modal** with persistent preferences:
  - Appearance: theme (Auto / Dark / Light) with flash-prevention, accent
    color (6 presets), density, layout (grid / list), text size, particles
    preset (Standard / Minimal / Off).
  - Behavior: sort order (Config / A-Z / Recent / Top), show-last-triggered,
    show-counters, haptic feedback, pull-to-refresh, offline queue,
    browser notifications.
  - App: "Install as app" button when the PWA is installable.
  - Data: open editor, export, import, reset settings.
- **Trigger history drawer** — newest-first ring buffer of the last 50
  fires with per-entry Retry and Details, a Clear action, and a Stats
  button that opens a KPI / most-fired / recent-errors modal.
- **Bulk-fire** — Shift-click to multi-select trigger buttons; a floating
  bar offers a single confirm that fires everything sequentially.
- **Search / filter bar** with `/` and `Ctrl+K` focus shortcuts.
- **Keyboard shortcuts**: 1-9 fire favorite N, `t` toggles TEST/PROD,
  `?` opens a cheat sheet, `Esc` closes modals.
- **Response viewer** — pretty-printed upstream body (JSON auto-formatted),
  response headers (collapsible), HTTP code, duration, truncation flag.
  Surfaces via a "Details" action on the result toast.
- **Copy-as-cURL** inside the response viewer.
- **Hover preview card** (desktop only) with redacted URL, last-fired
  relative time, total fire count, description.
- **Drag-and-drop reordering** inside categories and in the favorites
  tray; drag snaps the sort mode back to `Config` so it remains visible.
- **Collapsible favorites bar.**
- **Generic modal primitive** (`openModal`) used by the response viewer,
  cheatsheet, stats, share picker, bulk-fire confirm, etc.
- **Empty-state onboarding** when `config/config.php` is missing / empty.
- **Last-triggered timestamps** and **fire counters** as optional
  overlays on trigger buttons.
- **TEST / PROD diff warning** when the mode switch leaves some webhooks
  without a target URL.

**PWA**
- **Service worker** (`sw.js`) with app-shell precache, stale-while-
  revalidate for static assets, and **network-first for navigations** so
  deploys are seen immediately when online.
- **Update notification** — a 30 s "New version available — Reload" toast
  fires when a new SW is waiting; Reload posts `SKIP_WAITING` and swaps
  it in. First-install skips the reload.
- **Install prompt** captured from `beforeinstallprompt`; exposed as an
  Install button in Settings > App.
- **Offline queue** (opt-in) captures fires while offline in
  localStorage (capped at 100) and drains through `api/trigger.php` on
  the next `online` event.
- **Browser notifications** (opt-in) when a fire completes with the tab
  backgrounded. Same-webhook tagging prevents spam.
- **Pull-to-refresh** (opt-in, mobile).
- **Share target** — manifest `share_target` makes TriggerForge a share
  destination; the shared payload (title / text / url, validated + 2 KB
  capped) is forwarded via a webhook picker.
- **Haptic feedback** (opt-in) via `navigator.vibrate`.

**A11y**
- Skip-to-content link.
- Keyboard-accessible favorite stars (role=button + aria-pressed).
- ARIA-live cooldown announcements (sr-only, second-granular, not rAF).
- Focus trap extended to history drawer and bulk-fire bar while a modal
  is open.
- Stronger focus ring with accent glow.
- `prefers-reduced-motion` and `prefers-reduced-data` respected.

**Security**
- Server-side URL → item map so per-item payload / method / headers are
  honoured for the fired URL (still config-only).
- `undo_url` entries whitelisted alongside the main URLs without
  clobbering a full item record when URLs coincide.
- Strict URL allow-list for `_app.background_image`.
- `tf_version()` output sanitized against CR/LF so a hand-crafted git
  tag cannot inject a second HTTP header via the outbound User-Agent.
- Upper bound (1 hour) on `cooldown`, enforced both server and client.
- `_app.title` capped at 64 characters.
- Request body size caps on `api/trigger.php` (8 KB) and
  `api/import.php` (256 KB).
- `.htaccess.example` exempts `sw.js` from Basic Auth so service-worker
  update checks can run even when the session isn't re-prompted.
- Inline scripts moved to external files so `script-src 'self'` stays
  strict in production.
- Optional IP allowlist recipe documented in `SETUP_SECURITY.md`.

**Developer / Ops**
- `lib/render.php` — PHP render helpers (`tf_render_webhook_button`,
  `tf_render_link_button`, `tf_render_chain_button`,
  `tf_render_category_open`, `tf_icon`, `tf_e`).
- `lib/version.php` — `tf_version()` resolving via `git describe → package.json → fallback`, sanitized.
- Dynamic cache-busting of CSS / JS via `?v=<filemtime>`.
- `User-Agent: TriggerForge/<version> (+https://byteside.io)` on every
  outbound fire.
- Expanded `config.example.php` with a commented template gallery
  (Slack, Discord, Teams, IFTTT, Zapier, generic REST with auth,
  no-confirm ping).
- `CHANGELOG.md` (this file).

### Changed

- **`triggered_at` in the outbound payload is now ISO 8601**
  (`2024-01-15T10:30:00+00:00`) instead of `Y-m-d H:i:s`. See the
  **Breaking** section below.
- **`triggered_by`** (the Basic-Auth username, `'anonymous'` if none) is
  now included in every outbound payload.
- **`User-Agent`** now carries the runtime version.
- **`_meta`** keys skipped on all iteration paths (render, trigger
  whitelist, sort).
- **Response body is captured** (up to 64 KB) and returned inside the
  client response envelope; truncated in history storage to 4 KB per
  entry so the 50-entry ring buffer can't exceed the localStorage budget.
- Empty config (`{}`) is now a valid state and no longer rejected by
  the validator — it's the only way to "clear" via import.
- Favorites-bar, category-section and search-bar backgrounds went
  through CSS-custom-property tokens (`--panel-bg`, `--panel-border`,
  `--divider`, …) to support the light theme cleanly.
- `--text-muted` bumped from 0.5 to 0.6 alpha for WCAG contrast.
- Focus outline 2 px → 3 px with a 5 px primary-tinted glow.

### Fixed

- Config editor now renders categories that have `_meta` alongside
  items (PHP mixed-key arrays serialise to JSON objects, which our old
  `Array.isArray` check refused).
- `mergeSettings` dead code / broken recursion removed.
- Service worker `respondWith` now always resolves to a valid Response
  (synthetic 503 when offline + no cache).
- Service worker no longer double-loads on first install.
- Sort order is no longer partially overwritten by a redundant
  `applyItemOrder()` call after non-config sorts.
- Drag-sort now snaps the sort mode back to Config so the manual order
  remains visible.
- `undo_url` stub cannot clobber a full item's whitelist entry when URLs
  coincide.
- Particles preset off → on switches correctly (canvas + animate loop
  are always set up, with 0 particles when off).
- Top-level `_`-prefixed keys are skipped in the trigger whitelist.
- `.htaccess` + `.htaccess.example`: `config/backups/` and
  `pfad.php`-less path lookup.
- Timezone set at the top of every endpoint that calls `date()`, so
  `date.timezone`-less hosts don't emit E_WARNING into JSON responses.
- History response body capped at 4 KB per entry to protect
  localStorage quota.
- Offline queue drops 4xx / 5xx entries (no endless retry) while keeping
  genuine network failures queued for the next attempt.
- `_app.background_image` allow-list tightened against CSS-injection
  tricks (`');background:red;(`-style).
- Bulk-fire bar stays inert while idle off-screen.
- Category names starting with `_` are rejected up-front in the editor.
- `Object.prototype.hasOwnProperty.call(...)` everywhere a user-supplied
  key is looked up — prototype-pollution safe.
- Over a dozen smaller robustness fixes documented in git history.

### Security

- CSP-compliant without `'unsafe-inline'`: all inline scripts moved
  to external files.
- Version string sanitized against CR/LF header injection.
- Request body size caps on all write endpoints.
- Atomic config writes (tmp + rename) with pre-write backups.
- `api/import.php` validates the whole payload against
  `tf_validate_config()` before writing; broken imports never land.

### Breaking

- **`triggered_at` format change** — upstream workflows that strict-parse
  `'Y-m-d H:i:s'` need to accept ISO 8601 (`2024-01-15T10:30:00+00:00`).
  The mainstream automation platforms (n8n, Make, Zapier) handle both
  formats natively; check your custom parsers.
- Saved settings no longer carry a nested `features` object — it was
  flattened to top-level `enablePullToRefresh`, `enableOfflineQueue`,
  `enablePushNotifications`. Old values were all `false`, so nothing
  is lost in practice, but a theoretical consumer reading the raw
  localStorage would now miss the old key.

### Upgrade notes

- Update `.htaccess` against the new `.htaccess.example` — the new
  `<FilesMatch "^sw\.js$">` block exempts the service worker from Basic
  Auth so update checks can run independently of the user's session.
- Make sure `config/` is writable by the PHP/Apache user if you want to
  use the web editor. `config/backups/` is auto-created on first save.
- Service Worker `CACHE_NAME` bumped to `tf-v1.1.0` so the old v1
  cache is purged cleanly on activation — no action needed.

## [1.0.0] — Initial release

Production-ready baseline: single-click webhook triggering, TEST/PROD
mode, Basic-Auth-gated UI, server-side whitelisted cURL proxy,
favorites bar with cooldown timer, toast feedback, confirmation modal,
dark glassmorphism theme, PWA manifest, self-hosted fonts and icons.

[1.1.0]: https://github.com/ByteSide/TriggerForge/releases/tag/v1.1.0
[1.0.0]: https://github.com/ByteSide/TriggerForge/releases/tag/v1.0.0
