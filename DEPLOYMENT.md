# TriggerForge - Deployment Guide

Step-by-step guide for deploying to your web hosting provider.

## Before Upload

### 1. Create .htpasswd

Generate your `.htpasswd` file **locally** — never send passwords to an online service. The `-B` flag selects bcrypt (the strongest hash Apache supports); without it, htpasswd defaults to the much weaker APR1/MD5.

**Linux / macOS:**
```bash
htpasswd -B -c .htpasswd admin
```

**Windows (PowerShell, if Apache tools are installed):**
```powershell
C:\xampp\apache\bin\htpasswd.exe -B -c .htpasswd admin
```

**Fallback (bcrypt via PHP one-liner):**
```bash
php -r 'echo "admin:".password_hash("your-password", PASSWORD_BCRYPT)."\n";' > .htpasswd
```

You'll be prompted for a password — pick a strong one. With `-B` the resulting file will contain a single line like `admin:$2y$05$...`.

**Important:** Store the username and password in a password manager — you'll need them to log in.

### 2. Prepare .htaccess

You need to know the absolute path to `.htpasswd`. You'll find this out after uploading the files (see below).

For now, you can leave `.htaccess.example` as is.

### 3. Configure Webhooks

Open `config/config.php` and add your webhook URLs:

```php
return [
    'Your Category' => [
        [
            'type' => 'webhook',
            'name' => 'Your Webhook',
            'webhook_url_test' => 'https://your-automation.com/webhook-test/...',
            'webhook_url_prod' => 'https://your-automation.com/webhook/...',
            'description' => 'Description'
        ]
    ]
];
```

Save!

## FTP Upload

### Prepare FTP Credentials

You need:
- FTP Server (e.g. `yourdomain.com` or `ftp.yourdomain.com`)
- FTP Username
- FTP Password
- Port (usually 21 for FTP or 22 for SFTP)

You can find these in your hosting provider's control panel.

### Open FTP Client

Recommended programs:
- **FileZilla** (Windows, Mac, Linux) - free
- **Cyberduck** (Mac, Windows) - free
- **WinSCP** (Windows) - free

### Connect

1. Open your FTP client
2. Enter your FTP credentials
3. Connect to the server

### Upload Files

1. Navigate to your desired directory on the server, e.g.:
   - `/public_html/triggerforge/`
   - or `/www/triggerforge/`
   - or `/html/triggerforge/`

2. Create the `triggerforge` folder if it doesn't exist

3. Upload **all** files and folders from your local TriggerForge directory:
   ```
   ├── .htaccess
   ├── .htpasswd
   ├── index.php            # main UI
   ├── admin.php            # config editor (also Basic-Auth-gated)
   ├── sw.js                # service worker (CSP-exempt via .htaccess)
   ├── README.md
   ├── DEPLOYMENT.md
   ├── SETUP_SECURITY.md
   ├── api/                 # trigger.php, import.php, export.php
   ├── assets/              # favicons, fonts, Boxicons
   ├── config/              # config.php (+ schema, example, backups)
   ├── css/                 # bg.css, style.css, admin.css
   ├── js/                  # app.js, admin.js, particles.js,
   │                        # theme-preload.js
   └── lib/                 # render.php, validate-config.php, version.php
   ```

4. Make sure the folder structure is preserved
5. `config/backups/` is **auto-created** the first time you save via the
   web editor — you do not need to create it manually, but the
   `config/` directory must be writable by the PHP/Apache user

**Important:** Also upload hidden files (starting with `.`)!

### Set File Permissions

If needed, set the following permissions (CHMOD):
- `.htaccess` → 644
- `.htpasswd` → **600** (owner-only; prevents other local users on shared hosting from reading the hashed credentials). If Apache runs as a different user and fails to read it, try 640 with the Apache group as the file group.
- `index.php`, `admin.php`, `sw.js` → 644
- `config/config.php` → **600** if you only edit it via FTP, or **644** if you want to use the web editor (`admin.php` writes to this file). Same permission trade-off as `.htpasswd`.
- `config/` (directory) → **755** and **must be writable** by the PHP/Apache user so `admin.php`, `api/import.php`, and `config/backups/` can work.
- `api/*.php`, `lib/*.php` → 644
- All other folders → 755

In FileZilla: Right-click on file → "File Permissions"

## After Upload

### 1. Find Absolute Path

Most hosting providers expose the absolute document root in their control panel (look for "Document Root", "Home Directory" or "Absolute Path"). Use that path and append `/triggerforge/.htpasswd`.

If it is not available, SSH into the server and run:
```bash
pwd
```
from inside the `triggerforge` directory.

**Avoid** creating a temporary PHP info/path script inside the web root — if you forget to delete it, it leaks server filesystem layout to anyone on the internet.

### 2. Update .htaccess

1. Download `.htaccess` from the server (or open it in FTP editor)
2. Find the line: `AuthUserFile /path/to/your/.htpasswd`
3. Replace it with the copied path, e.g.:
   ```apache
   AuthUserFile /home/username/public_html/triggerforge/.htpasswd
   ```
4. Save and upload

### 3. Test

1. Open in browser: `https://yourdomain.com/triggerforge/`
2. You'll be prompted for username and password
3. Enter the credentials you used when creating .htpasswd
4. TriggerForge should now be displayed!

### 4. Test Webhook

1. Click on a button
2. You should see the loading state on the button and a spinner icon
3. A success or error toast appears in the top-right corner
4. Click "Details" on the toast (when available) to see the upstream response body
5. Check your automation platform to see if the workflow was triggered

### 5. (Optional) Try the config editor

1. Visit `https://yourdomain.com/triggerforge/admin.php`
2. Add a category, add an item, fill in the URLs, click **Save config**
3. On success the main UI at `https://yourdomain.com/triggerforge/` shows the new button (reload if already open)
4. If the save fails with a writability error, loosen permissions on `config/` until the PHP/Apache user can write there

### 6. (Optional) Install as a PWA

1. From Chrome/Edge: URL-bar install icon, or **Settings > App > Install as app** inside TriggerForge
2. From iOS Safari: Share → "Add to Home Screen"
3. From Android Chrome: three-dot menu → "Add to Home Screen"
4. Once installed, the app runs offline (cached shell) and appears in the OS share sheet as a target

## Deployment Troubleshooting

### "403 Forbidden"
- `.htaccess` is malformed
- Check the path in `AuthUserFile`
- Make sure `.htpasswd` exists

### "500 Internal Server Error"
- Path in `.htaccess` is wrong (must be absolute)
- PHP error in one of the files
- Check server logs in your hosting control panel

### Login Dialog Not Appearing
- `.htaccess` was not uploaded or is not active
- Apache mod_auth is not enabled
- Filename wrong (must be exactly `.htaccess`)

### Login Not Accepted
- Wrong credentials
- `.htpasswd` is malformed or missing
- Path in `.htaccess` doesn't point to `.htpasswd`

### Page Not Found
- Wrong directory
- URL is incorrect
- DNS not yet propagated (for new domains, can take 24h)

### Buttons Not Working
- JavaScript not loaded - check browser console (F12)
- `js/app.js` not uploaded
- Path in `index.php` is wrong

### Webhook Not Triggering
- URL in `config/config.php` is wrong
- Automation server is not reachable
- Webhook is disabled or misconfigured
- Test the webhook URL directly with curl or Postman
- Use the **Copy as cURL** action inside the response-viewer modal to reproduce the exact client → server request

### Config Editor Can't Save
- `config/` directory is not writable by the PHP/Apache user — relax permissions to `755` (directory) and `644` (file)
- Validator rejected the change — an error modal lists what to fix
- A backup failed silently; check `config/backups/` exists and is writable

### "New version available" Toast Keeps Appearing
- The service worker picked up a deploy; click **Reload** to swap to the new version
- If it loops: hard-reload (Ctrl+Shift+R) or clear the service worker via DevTools (Application → Service Workers → Unregister)

### Offline Queue Not Draining
- Setting disabled — open Settings > Behavior and enable **Queue fires when offline**
- The browser hasn't fired an `online` event yet (reloading the page while online drains the queue too)

## Setup HTTPS

Most hosting providers offer HTTPS via Let's Encrypt.

### Verify
Open your site with `https://`. If it works, you're done!

### If Not Available
1. Go to your hosting provider's control panel
2. Look for "SSL/TLS" or "Let's Encrypt"
3. Enable the free SSL certificate for your domain
4. Wait 5-10 minutes for activation

The `.htaccess` automatically redirects to HTTPS once available.

## Deployment Checklist

- [ ] `.htpasswd` created with `htpasswd -B` (bcrypt) or the PHP one-liner
- [ ] `config/config.php` customized with own webhook URLs (or will be created via the web editor)
- [ ] FTP connection to server established
- [ ] `/triggerforge/` directory created on server
- [ ] All files and folders uploaded, **including** `admin.php`, `sw.js`, `js/theme-preload.js`, `lib/`
- [ ] File permissions set, with `config/` writable by the PHP/Apache user if you plan to use the web editor
- [ ] Absolute path to `.htpasswd` obtained from hosting panel or SSH `pwd`
- [ ] `.htaccess` updated with correct path
- [ ] `config/backups/` left out of version control (already in `.gitignore`) — will be auto-created on first editor save
- [ ] Login tested in browser
- [ ] At least one webhook tested
- [ ] HTTPS working
- [ ] Mobile view tested
- [ ] (Optional) installed as PWA on at least one device
- [ ] (Optional) `pfad.php` deleted from the server if a setup helper was ever uploaded

## Update Process

To update TriggerForge (e.g. after changes):

1. Edit files locally
2. Upload only the changed files via FTP
3. Overwrite the old files
4. CSS/JS changes are **cache-busted automatically** via `?v=<filemtime>` query strings — no manual browser cache-clear needed
5. If you installed the PWA and/or the service worker is active, a **New version available** toast appears the next time a user visits; clicking **Reload** swaps in the fresh copy

**Never overwrite `.htpasswd` and `.htaccess` unless you deliberately rotated the credentials or changed Apache settings** — both are gitignored and host-specific.

**Tip:** Use `admin.php`'s **Export config** action before any risky change. The resulting JSON is a one-click rollback via **Import config**, and each save is additionally backed up to `config/backups/config.<ts>.php.bak` (ring buffer of 10).

---

For more questions: See README.md for detailed documentation.
