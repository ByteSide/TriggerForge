# Security Policy

## Supported versions

TriggerForge follows a simple support model: only the latest minor
release line is actively maintained. Fixes for security issues land on
`main` and are rolled into the next patch release.

| Version | Supported |
|---------|-----------|
| 1.1.x   | Yes       |
| 1.0.x   | Upgrade recommended |

## Reporting a vulnerability

Please **do not open a public GitHub issue** for a suspected security
bug. Instead, either

- use GitHub's **Private vulnerability reporting** feature on
  [ByteSide/TriggerForge](https://github.com/ByteSide/TriggerForge/security/advisories/new),
  or
- email the author at **security@byteside.io** with:
  - a short description of the issue,
  - steps to reproduce (a minimal failing config, URL, or request if
    applicable),
  - your assessment of the impact,
  - optionally, a proposed fix.

You should get an acknowledgement within a few working days. Once the
fix is ready we coordinate a disclosure date — typically the day the
patch release ships.

## Scope

In scope:

- `api/trigger.php`, `api/import.php`, `api/export.php` request
  handling — SSRF, auth bypass, CSRF, XSS in JSON responses, path
  traversal.
- `index.php`, `admin.php` rendering and editor — XSS, CSRF via
  authenticated actions, unsafe `var_export` / `require` paths.
- `lib/validate-config.php` — missed validation classes that let an
  imported config reach a state the app cannot recover from.
- `sw.js` — cache-poisoning vectors, request smuggling.
- `.htaccess.example` — misconfigurations that expose secrets
  (`.htpasswd`, `config.php`, backups).

Out of scope (not security issues):

- Cooldown bypass via localStorage edit — the cooldown is a UX aid,
  not an enforcement boundary; use upstream rate limiting.
- Authenticated users reading each other's favorites — single-user
  tool by design.
- Favicons leaking configured hostnames to `google.com/s2/favicons` —
  documented; opt out via per-item `icon` or `prefers-reduced-data`.
- Denial of service against the host by an authenticated user —
  deploy behind Cloudflare or `mod_ratelimit` if needed.

## Defence layers (for context)

The app already ships with:

- HTTP Basic Auth via `.htaccess`, forced HTTPS redirect.
- Strict `Content-Security-Policy` (no `'unsafe-inline'` in
  `script-src`).
- Server-side URL whitelist — `api/trigger.php` only forwards to URLs
  listed in `config/config.php`.
- `CURLOPT_PROTOCOLS` limited to `http,https` (no `file://`,
  `gopher://`, etc.) and `CURLOPT_FOLLOWLOCATION = false` to prevent
  SSRF via redirects into cloud-metadata endpoints.
- Custom payloads / methods / headers are **config-only** — the client
  cannot inject them.
- JSON-only API (blocks text/plain form CSRF via content-type).
- Atomic config writes with pre-write backups (`config/backups/`).

Optional hardening is documented in
[SETUP_SECURITY.md](SETUP_SECURITY.md) (strong `.htpasswd`, file
permissions, IP allowlist).
