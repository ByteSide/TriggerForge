<?php
/**
 * TriggerForge — config validator.
 *
 * Exposes two things:
 *   1. `tf_validate_config(array $config): array` — returns a flat list of
 *      human-readable error messages (empty array = OK). Used by the
 *      upcoming import endpoint and the web config editor.
 *   2. A CLI entry point: `php lib/validate-config.php [path/to/config.php]`
 *      prints errors to stderr and exits non-zero on failure, zero on
 *      success.
 *
 * Validation rules mirror the documented schema (config/config.schema.json)
 * and the actual renderer in lib/render.php, so what the validator accepts
 * is exactly what the UI will render without surprises.
 */

if (!function_exists('tf_validate_config')) {

/**
 * @param array $config  Associative array loaded from config.php (i.e. the
 *                       return value of that file, already type-checked).
 * @return string[]      List of error messages. Empty array = config is
 *                       valid.
 */
function tf_validate_config(array $config) {
    $errors = [];
    $seenExplicitIds = [];
    $allowedTypes = ['webhook', 'link', 'chain'];
    $allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    $urlPattern = '#^https?://[^\s]+$#i';
    $linkProtos = '#^(https?|mailto|tel)://?[^\s]+$#i';
    $iconPattern = '/^bx[a-z]*-[a-z0-9-]+$/';
    $idPattern = '/^[A-Za-z0-9_-]+$/';

    if (empty($config)) {
        // An empty config is a legitimate state — the app renders an
        // onboarding page and admin.php starts with an empty editor.
        // Importing an empty object is the only way to clear everything,
        // so returning early (without errors) must leave validation OK.
        return $errors;
    }

    foreach ($config as $categoryName => $webhooks) {
        // Reserved app-level metadata (optional). Not a category.
        if ($categoryName === '_app') {
            if (!is_array($webhooks)) {
                $errors[] = '_app: must be an object';
                continue;
            }
            if (isset($webhooks['title']) && !is_string($webhooks['title'])) {
                $errors[] = '_app.title: must be a string';
            }
            if (isset($webhooks['background_image'])) {
                if (!is_string($webhooks['background_image']) ||
                    !preg_match('#^https?://|^/|^\./|^assets/#i', $webhooks['background_image'])) {
                    $errors[] = '_app.background_image: must be a URL or a relative assets/ path';
                }
            }
            continue;
        }

        $catLabel = is_string($categoryName) ? $categoryName : '#' . $categoryName;
        if (!is_array($webhooks)) {
            $errors[] = "[$catLabel]: value is not an array (expected a list of items)";
            continue;
        }

        // _meta validation (optional)
        if (isset($webhooks['_meta'])) {
            if (!is_array($webhooks['_meta'])) {
                $errors[] = "[$catLabel]._meta: must be an array";
            } else {
                $meta = $webhooks['_meta'];
                if (isset($meta['icon']) && (!is_string($meta['icon']) || !preg_match($iconPattern, $meta['icon']))) {
                    $errors[] = "[$catLabel]._meta.icon: '" . (is_string($meta['icon']) ? $meta['icon'] : gettype($meta['icon'])) . "' is not a valid Boxicon class name";
                }
                if (isset($meta['color']) && (!is_string($meta['color']) || !preg_match('/^#[0-9a-fA-F]{3,8}$/', $meta['color']))) {
                    $errors[] = "[$catLabel]._meta.color: must be a hex color like #ef4444";
                }
            }
        }

        foreach ($webhooks as $index => $item) {
            if ($index === '_meta') continue;
            $itemLabel = "[$catLabel][$index]";

            if (!is_array($item)) {
                $errors[] = "$itemLabel: item is not an array";
                continue;
            }

            // Type (default 'webhook')
            $type = isset($item['type']) ? $item['type'] : 'webhook';
            if (!in_array($type, $allowedTypes, true)) {
                $errors[] = "$itemLabel.type: '$type' is not one of " . implode(', ', $allowedTypes);
                continue; // skip further validation — we don't know what shape to expect
            }

            // Name — required for both types
            if (!isset($item['name']) || !is_string($item['name']) || trim($item['name']) === '') {
                $errors[] = "$itemLabel.name: required non-empty string";
            }

            // id — optional but validated when set + deduped globally
            if (isset($item['id'])) {
                if (!is_string($item['id']) || !preg_match($idPattern, $item['id'])) {
                    $errors[] = "$itemLabel.id: must match [A-Za-z0-9_-]+";
                } else {
                    if (isset($seenExplicitIds[$item['id']])) {
                        $errors[] = "$itemLabel.id: duplicate id '" . $item['id'] . "' (first seen at " . $seenExplicitIds[$item['id']] . ")";
                    } else {
                        $seenExplicitIds[$item['id']] = $itemLabel;
                    }
                }
            }

            // description — optional string
            if (isset($item['description']) && !is_string($item['description'])) {
                $errors[] = "$itemLabel.description: must be a string";
            }

            // icon — optional, validated pattern
            if (isset($item['icon']) && (!is_string($item['icon']) || !preg_match($iconPattern, $item['icon']))) {
                $errors[] = "$itemLabel.icon: not a valid Boxicon class name (example: 'bx-envelope')";
            }

            if ($type === 'webhook') {
                foreach (['webhook_url_test', 'webhook_url_prod'] as $key) {
                    if (!isset($item[$key]) || !is_string($item[$key]) || trim($item[$key]) === '') {
                        $errors[] = "$itemLabel.$key: required non-empty URL";
                        continue;
                    }
                    if (!preg_match($urlPattern, $item[$key])) {
                        $errors[] = "$itemLabel.$key: '" . $item[$key] . "' is not a valid http(s) URL";
                    }
                }

                if (isset($item['cooldown'])) {
                    if (!is_int($item['cooldown']) || $item['cooldown'] < 0) {
                        $errors[] = "$itemLabel.cooldown: must be a non-negative integer (milliseconds)";
                    } elseif ($item['cooldown'] > 3600000) {
                        // Cap at an hour — huge values would leave users
                        // stuck with a disabled button across reloads.
                        $errors[] = "$itemLabel.cooldown: must be ≤ 3 600 000 ms (1 hour)";
                    }
                }
                if (isset($item['confirm']) && !is_bool($item['confirm'])) {
                    $errors[] = "$itemLabel.confirm: must be true or false";
                }
                if (isset($item['payload']) && !is_array($item['payload'])) {
                    $errors[] = "$itemLabel.payload: must be an array (object)";
                }
                if (isset($item['method'])) {
                    if (!is_string($item['method']) || !in_array(strtoupper($item['method']), $allowedMethods, true)) {
                        $errors[] = "$itemLabel.method: must be one of " . implode(', ', $allowedMethods);
                    }
                }
                if (isset($item['headers'])) {
                    if (!is_array($item['headers'])) {
                        $errors[] = "$itemLabel.headers: must be an object (name => value)";
                    } else {
                        foreach ($item['headers'] as $hn => $hv) {
                            if (!is_string($hn) || !is_string($hv)) {
                                $errors[] = "$itemLabel.headers: all names and values must be strings";
                                break;
                            }
                        }
                    }
                }
                if (isset($item['undo_url'])) {
                    if (!is_string($item['undo_url']) || !preg_match($urlPattern, $item['undo_url'])) {
                        $errors[] = "$itemLabel.undo_url: must be a valid http(s) URL";
                    }
                }
            } elseif ($type === 'link') {
                if (!isset($item['url']) || !is_string($item['url']) || trim($item['url']) === '') {
                    $errors[] = "$itemLabel.url: required non-empty URL";
                } elseif (!preg_match($linkProtos, $item['url'])) {
                    $errors[] = "$itemLabel.url: only http(s)/mailto/tel protocols are allowed";
                }
            } elseif ($type === 'chain') {
                if (!isset($item['steps']) || !is_array($item['steps']) || count($item['steps']) === 0) {
                    $errors[] = "$itemLabel.steps: required non-empty array of step objects";
                } else {
                    foreach ($item['steps'] as $si => $step) {
                        if (!is_array($step)) {
                            $errors[] = "$itemLabel.steps[$si]: must be an object";
                            continue;
                        }
                        if (!isset($step['ref']) || !is_string($step['ref']) || !preg_match($idPattern, $step['ref'])) {
                            $errors[] = "$itemLabel.steps[$si].ref: required item id (A-Za-z0-9_-)";
                        }
                        if (isset($step['delayMs']) && (!is_int($step['delayMs']) || $step['delayMs'] < 0 || $step['delayMs'] > 600000)) {
                            $errors[] = "$itemLabel.steps[$si].delayMs: integer between 0 and 600000 (10 minutes)";
                        }
                    }
                }
            }
        }
    }

    return $errors;
}

} // function_exists guard

// ===========================================================
// CLI entry point. Only runs when the file is invoked directly
// (not when included from the import endpoint / config editor).
// ===========================================================
if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $target = isset($argv[1]) ? $argv[1] : dirname(__DIR__) . '/config/config.php';
    if (!file_exists($target)) {
        fwrite(STDERR, "validate-config: file not found: $target\n");
        exit(2);
    }
    $config = @require $target;
    if (!is_array($config)) {
        fwrite(STDERR, "validate-config: $target did not return an array\n");
        exit(2);
    }
    $errors = tf_validate_config($config);
    if (empty($errors)) {
        fwrite(STDOUT, "validate-config: OK\n");
        exit(0);
    }
    fwrite(STDERR, "validate-config: " . count($errors) . " problem(s):\n");
    foreach ($errors as $err) {
        fwrite(STDERR, "  • $err\n");
    }
    exit(1);
}
