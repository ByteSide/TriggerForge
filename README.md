# TriggerForge

A sleek, secure web application for manually triggering webhooks with a single click.

![TriggerForge](https://img.shields.io/badge/version-1.0.0-orange)
![License](https://img.shields.io/badge/license-MIT-blue)
![PHP](https://img.shields.io/badge/PHP-7.4+-purple)

## Overview

TriggerForge provides a beautiful, mobile-friendly dashboard for triggering webhooks from any automation platform - n8n, Make (Integromat), Zapier, or your own custom APIs. Perfect for manual workflow triggers, quick actions, and automation control panels.

## Features

- 🔐 **Password Protection** - HTTP Basic Auth for secure access
- 📱 **Mobile Optimized** - Works great on phones and tablets, installable as PWA
- 🎨 **Beautiful UI** - Dark theme with glassmorphism and interactive particle background
- ⚡ **Any Webhook** - Works with n8n, Make, Zapier, custom APIs, and more
- 🔄 **Test/Prod Toggle** - Switch between test and production webhooks
- ⭐ **Favorites** - Quick access to your most-used webhooks
- 🔗 **Custom Links** - Add external links alongside webhooks
- 🛡️ **Secure** - Server-side webhook calls (URLs hidden from browser)

## Requirements

- PHP 7.4 or higher
- Apache with `mod_rewrite` and `mod_auth` enabled
- HTTPS (recommended)

## Quick Start

### 1. Download & Upload

Download or clone this repository and upload all files to your web server:

```
/your-directory/
├── .htaccess.example     → rename to .htaccess
├── index.php
├── config/
│   └── config.example.php → rename to config.php
├── api/
├── assets/
├── css/
└── js/
```

### 2. Create Password File

Generate a `.htpasswd` file for HTTP Basic Auth:

**Option A: Online Generator**
1. Visit: https://www.web2generators.com/apache-tools/htpasswd-generator
2. Enter username and password
3. Copy the generated line to a new file named `.htpasswd`
4. Upload to your TriggerForge directory

**Option B: Command Line**
```bash
htpasswd -c .htpasswd yourusername
```

### 3. Configure .htaccess

1. Rename `.htaccess.example` to `.htaccess`
2. Find your absolute server path using `pfad.php`:
   ```
   https://yourdomain.com/triggerforge/pfad.php
   ```
3. Update the `AuthUserFile` path in `.htaccess`:
   ```apache
   AuthUserFile /absolute/path/to/your/triggerforge/.htpasswd
   ```
4. **Delete `pfad.php`** after finding your path!

### 4. Add Your Webhooks

1. Rename `config/config.example.php` to `config/config.php`
2. Add your webhooks:

```php
return [
    'My Category' => [
        [
            'type' => 'webhook',
            'name' => 'Trigger Workflow',
            'webhook_url_test' => 'https://your-automation.com/webhook-test/xxx',
            'webhook_url_prod' => 'https://your-automation.com/webhook/xxx',
            'description' => 'What this webhook does'
        ],
        [
            'type' => 'link',
            'name' => 'Dashboard',
            'url' => 'https://your-dashboard.com',
            'description' => 'Opens external dashboard'
        ]
    ]
];
```

### 5. Test

Open `https://yourdomain.com/triggerforge/` in your browser. You should see a login prompt, then your webhook dashboard!

## Mobile Installation (PWA)

### iPhone/iPad
1. Open TriggerForge in Safari
2. Tap the Share button
3. Select "Add to Home Screen"

### Android
1. Open TriggerForge in Chrome
2. Tap the menu (3 dots)
3. Select "Add to Home Screen"

## Configuration

### Webhook Structure

```php
[
    'type' => 'webhook',           // Required: 'webhook' or 'link'
    'name' => 'Button Text',       // Required: Display name
    'webhook_url_test' => '...',   // Required for webhooks: Test URL
    'webhook_url_prod' => '...',   // Required for webhooks: Production URL
    'description' => '...'         // Optional: Tooltip text
]
```

### Link Structure

```php
[
    'type' => 'link',
    'name' => 'Link Text',
    'url' => 'https://...',        // Required: External URL
    'description' => '...'         // Optional: Tooltip text
]
```

## Security

### Built-in Protection

1. **HTTP Basic Auth** - Password protection for the entire app
2. **HTTPS Redirect** - Automatic redirect to secure connection
3. **Server-side Calls** - Webhook URLs are never exposed to the browser
4. **URL Whitelist** - Only configured URLs can be triggered
5. **Config Protection** - Direct access to config.php is blocked

### Recommendations

- Use strong, unique passwords
- Use HTTPS (Let's Encrypt is free)
- Keep your webhook URLs secret and use random IDs
- Regularly update your `.htpasswd` password

## Troubleshooting

### 500 Internal Server Error
- Check the `AuthUserFile` path in `.htaccess` (must be absolute)
- Verify `.htpasswd` exists and is readable

### Login Not Working
- Regenerate `.htpasswd` with online generator
- Ensure no empty lines in `.htpasswd`
- Check file permissions (644 recommended)

### Webhooks Not Triggering
- Verify webhook URLs in `config/config.php`
- Test webhooks directly with curl or Postman
- Check that your automation platform is running

## File Structure

```
triggerforge/
├── .htaccess              # Security & redirects
├── .htpasswd              # Encrypted credentials (create this)
├── index.php              # Main interface
├── pfad.php               # Helper to find absolute path
├── api/
│   └── trigger.php        # Webhook trigger backend
├── config/
│   └── config.php         # Your webhook configuration
├── assets/
│   ├── favicons/          # PWA icons
│   ├── fonts/             # JetBrains Mono, Fira Code
│   └── icons/             # Boxicons
├── css/
│   ├── style.css          # Main styles
│   └── bg.css             # Background & particles
└── js/
    ├── app.js             # Application logic
    └── particles.js       # Interactive background
```

## License

MIT License - see [LICENSE](LICENSE) file.

## Credits

Created with ❤️ by [ByteSide.io](https://byteside.io)

---

**Version:** 1.0.0  
**Last Updated:** December 2025
