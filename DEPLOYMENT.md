# TriggerForge - Deployment Guide

Step-by-step guide for deploying to your web hosting provider.

## Before Upload

### 1. Create .htpasswd

Generate your `.htpasswd` file **locally** — never send passwords to an online service:

**Linux / macOS:**
```bash
htpasswd -c .htpasswd admin
```

**Windows (PowerShell, if Apache tools are installed):**
```powershell
C:\xampp\apache\bin\htpasswd.exe -c .htpasswd admin
```

**Fallback (bcrypt via openssl + PHP one-liner):**
```bash
php -r 'echo "admin:".password_hash("your-password", PASSWORD_BCRYPT)."\n";' > .htpasswd
```

You'll be prompted for a password — pick a strong one. The resulting file will contain a single line like `admin:$apr1$...`.

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
   ├── index.php
   ├── README.md
   ├── SETUP_SECURITY.md
   ├── assets/
   ├── css/
   ├── js/
   ├── config/
   └── api/
   ```

4. Make sure the folder structure is preserved

**Important:** Also upload hidden files (starting with `.`)!

### Set File Permissions

If needed, set the following permissions (CHMOD):
- `.htaccess` → 644
- `.htpasswd` → 644
- `index.php` → 644
- `config/config.php` → 644
- `api/trigger.php` → 644
- All folders → 755

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
2. You should see "triggering..." 
3. Then an alert shows success or error message
4. Check your automation platform to see if the workflow was triggered

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

- [ ] `.htpasswd` created with generator
- [ ] `config/config.php` customized with own webhook URLs
- [ ] FTP connection to server established
- [ ] `/triggerforge/` directory created on server
- [ ] All files and folders uploaded
- [ ] File permissions set (if needed)
- [ ] Absolute path to `.htpasswd` obtained from hosting panel or SSH `pwd`
- [ ] `.htaccess` updated with correct path
- [ ] Login tested in browser
- [ ] At least one webhook tested
- [ ] HTTPS working
- [ ] Mobile view tested

## Update Process

To update TriggerForge (e.g. after changes):

1. Edit files locally
2. Upload only the changed files via FTP
3. Overwrite the old files
4. For CSS/JS changes: Clear browser cache

**Tip:** Keep a local copy of all files so you can restore if there are problems!

---

For more questions: See README.md for detailed documentation.
