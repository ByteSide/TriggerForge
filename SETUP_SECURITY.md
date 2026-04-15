# Security Setup for TriggerForge

## Create .htpasswd File

The `.htpasswd` file contains the hashed username and password for HTTP Basic Auth protection. **Generate it locally** — never submit passwords to a third-party website.

### Option 1: `htpasswd` CLI (recommended)

```bash
htpasswd -B -c .htpasswd admin
```

`-B` selects bcrypt (strongest hash supported by Apache). You will be prompted for a password. Omit `-c` when adding additional users to an existing file.

### Option 2: PHP one-liner (when `htpasswd` is unavailable)

Run this **locally**, not on the web server:

```bash
php -r 'echo "admin:".password_hash("your-secure-password", PASSWORD_BCRYPT)."\n";' > .htpasswd
```

Apache 2.4+ accepts bcrypt (`$2y$...`) in `.htpasswd`.

> ⚠️ **Never** upload a PHP password-generation script to a live server. If you forget to delete it, it becomes a credential-harvest endpoint — and unreachable server-side files may still be served for a while after deletion due to caches.

## Update .htaccess Path

**IMPORTANT:** The absolute path to `.htpasswd` must be set in the `.htaccess` file!

1. Open the `.htaccess` file
2. Find the line: `AuthUserFile /path/to/your/.htpasswd`
3. Replace `/path/to/your/.htpasswd` with the actual absolute path on your webspace

**Examples for typical paths:**
```
AuthUserFile /home/username/public_html/triggerforge/.htpasswd
```

or

```
AuthUserFile /var/www/html/triggerforge/.htpasswd
```

### How to Find the Absolute Path?

Prefer any of the following, in order, so that nothing sensitive is ever exposed via the web root:

1. Look it up in your hosting control panel under "Document Root" or "Home Directory".
2. SSH into the server and run `pwd` from inside the `triggerforge` directory.
3. Check your FTP client's path bar — most clients show the absolute path on the server side.

Avoid dropping temporary `__DIR__` scripts into the web root; forgetting to delete one leaks server filesystem layout to anyone on the internet.

## Testing

1. Upload all files via FTP
2. Open in browser: `https://yourdomain.com/triggerforge/`
3. Login dialog should appear
4. Enter username and password
5. On successful login, the TriggerForge interface appears

## Troubleshooting

**"Internal Server Error 500"**
- Check the path in `AuthUserFile` - must be absolute
- Make sure `.htpasswd` is uploaded
- Check file permissions (`.htpasswd` should be 600 or 640 — NOT 644, otherwise other local users on shared hosting can read your hashed credentials)

**Login Not Working**
- Make sure you're using the correct password
- Check if `.htpasswd` is correctly formatted (no empty lines)

**HTTPS Redirect Not Working**
- mod_rewrite must be enabled on the server
- Make sure an SSL certificate is installed
