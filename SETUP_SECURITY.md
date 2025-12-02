# Security Setup for TriggerForge

## Create .htpasswd File

The `.htpasswd` file contains the encrypted username and password for HTTP Basic Auth protection.

### Option 1: Online Generator (Easiest Method)

1. Visit: https://www.web2generators.com/apache-tools/htpasswd-generator
2. Enter your desired username (e.g. `admin`)
3. Enter your desired password
4. Click "Generate"
5. Copy the generated line (looks like: `admin:$apr1$xyz...`)
6. Create a new file `.htpasswd` and paste this line
7. Upload the file via FTP to the `/triggerforge/` directory

### Option 2: With Local Apache (if available)

```bash
htpasswd -c .htpasswd admin
```

The program will ask for a password. The file is created automatically.

### Option 3: With PHP Script (temporary on server)

Create a temporary file `generate_htpasswd.php`:

```php
<?php
$username = 'admin';
$password = 'your-secure-password';
$hash = password_hash($password, PASSWORD_BCRYPT);
echo "$username:$hash";
?>
```

Open the script in your browser, copy the output to `.htpasswd` and DELETE the PHP script afterwards!

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

Create a temporary PHP file `pfad.php` with the following content:

```php
<?php
echo __DIR__;
?>
```

Open it in your browser - the output shows you the absolute path. DELETE the file afterwards!

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
- Check file permissions (`.htpasswd` should be 644)

**Login Not Working**
- Make sure you're using the correct password
- Check if `.htpasswd` is correctly formatted (no empty lines)

**HTTPS Redirect Not Working**
- mod_rewrite must be enabled on the server
- Make sure an SSL certificate is installed
