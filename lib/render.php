<?php
/**
 * TriggerForge — HTML render helpers.
 *
 * Extracted from index.php so the same button / category markup can be
 * reused by the (upcoming) config editor and the search/filter feature
 * without a second copy of the template drifting out of sync.
 *
 * All identifiers are expected to be pre-sanitised by the caller. The
 * helpers still run every *user-facing* string through htmlspecialchars.
 */

if (!function_exists('tf_e')) {
    /** Short alias for htmlspecialchars with the project's defaults. */
    function tf_e($value) {
        return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

if (!function_exists('tf_icon')) {
    /**
     * Resolve a Boxicons class name to a safe token. Only characters from
     * the Boxicons naming convention (`bx-foo`, `bxs-bar`) are accepted;
     * anything else falls back to $default. Prevents config typos from
     * injecting unrelated CSS classes into the icon slot.
     */
    function tf_icon($value, $default = 'bx-bolt') {
        if (!is_string($value)) return $default;
        return preg_match('/^bx[a-z]*-[a-z0-9-]+$/', $value) ? $value : $default;
    }
}

/**
 * Emit the opening markup for one category section: section > header > content > grid.
 * Must be paired with tf_render_category_close().
 */
function tf_render_category_open($categoryId, $categoryName, array $meta = array()) {
    // Optional per-category icon override via config's '_meta' => ['icon' => ...].
    $icon = tf_icon(isset($meta['icon']) ? $meta['icon'] : null, 'bx-folder');
    ?>
                    <section class="category-section">
                        <div class="category-header" data-category-id="<?php echo tf_e($categoryId); ?>" role="button" tabindex="0" aria-expanded="true">
                            <i class='bx <?php echo tf_e($icon); ?> category-header-icon'></i>
                            <h2 class="category-title"><?php echo tf_e($categoryName); ?></h2>
                            <i class='bx bx-chevron-down category-icon'></i>
                        </div>

                        <div class="category-content" data-category-id="<?php echo tf_e($categoryId); ?>">
                            <div class="button-grid">
    <?php
}

/** Emit the closing markup for a category section opened with tf_render_category_open(). */
function tf_render_category_close() {
    ?>
                            </div>
                        </div>
                    </section>
    <?php
}

/**
 * Emit a webhook trigger button.
 *
 * @param array  $item         Raw config entry (already validated is_array).
 * @param string $itemId       Final, sanitised id used as data-webhook-id.
 * @param string $categoryName Human-readable category name (passed through
 *                             as data-category for UI grouping).
 */
function tf_render_webhook_button(array $item, $itemId, $categoryName) {
    $itemName = (string)($item['name'] ?? '');
    $itemDesc = (string)($item['description'] ?? $itemName);
    // Optional per-webhook overrides. Emitted only when set so the JS side
    // can dataset-check against undefined and fall back to the default.
    $cooldownAttr = '';
    if (isset($item['cooldown']) && is_int($item['cooldown']) && $item['cooldown'] >= 0) {
        $cooldownAttr = ' data-cooldown="' . (int)$item['cooldown'] . '"';
    }
    $confirmAttr = '';
    if (isset($item['confirm']) && $item['confirm'] === false) {
        $confirmAttr = ' data-confirm="false"';
    }
    $undoAttr = '';
    if (isset($item['undo_url']) && is_string($item['undo_url']) && $item['undo_url'] !== '') {
        $undoAttr = ' data-undo-url="' . tf_e($item['undo_url']) . '"';
    }
    ?>

                                    <!-- Webhook Button -->
                                    <button
                                        type="button"
                                        class="trigger-btn"
                                        draggable="true"
                                        data-type="webhook"
                                        data-webhook-id="<?php echo tf_e($itemId); ?>"
                                        data-webhook-url-prod="<?php echo tf_e((string)($item['webhook_url_prod'] ?? '')); ?>"
                                        data-webhook-url-test="<?php echo tf_e((string)($item['webhook_url_test'] ?? '')); ?>"
                                        data-webhook-name="<?php echo tf_e($itemName); ?>"
                                        data-category="<?php echo tf_e($categoryName); ?>"<?php echo $cooldownAttr; echo $confirmAttr; echo $undoAttr; ?>
                                        title="<?php echo tf_e($itemDesc); ?>"
                                        aria-label="<?php echo tf_e($itemName); ?>"
                                    >
                                        <span class="trigger-btn-cooldown" aria-hidden="true"></span>
                                        <i class='bx <?php echo tf_e(tf_icon($item['icon'] ?? null, 'bx-bolt')); ?> trigger-btn-icon'></i>
                                        <span class="trigger-btn-text"><?php echo tf_e($itemName); ?></span>
                                        <i class='bx bx-star trigger-btn-favorite'
                                           data-webhook-id="<?php echo tf_e($itemId); ?>"
                                           role="button"
                                           tabindex="0"
                                           aria-label="Toggle favorite for <?php echo tf_e($itemName); ?>"
                                           aria-pressed="false"
                                           title="Toggle favorite"></i>
                                    </button>

    <?php
}

/** Emit a custom-link button (opens URL in a new tab, no backend call). */
function tf_render_link_button(array $item, $itemId, $categoryName) {
    $itemName = (string)($item['name'] ?? '');
    $itemDesc = (string)($item['description'] ?? $itemName);
    $itemUrl  = (string)($item['url'] ?? '');
    // Generate favicon URL (guard against malformed URLs / missing host).
    $domain = $itemUrl !== '' ? parse_url($itemUrl, PHP_URL_HOST) : null;
    $faviconUrl = $domain
        ? 'https://www.google.com/s2/favicons?domain=' . urlencode($domain) . '&sz=32'
        : '';
    ?>

                                    <!-- Custom Link Button -->
                                    <button
                                        type="button"
                                        class="custom-link-btn"
                                        draggable="true"
                                        data-type="link"
                                        data-link-id="<?php echo tf_e($itemId); ?>"
                                        data-link-url="<?php echo tf_e($itemUrl); ?>"
                                        data-link-name="<?php echo tf_e($itemName); ?>"
                                        data-category="<?php echo tf_e($categoryName); ?>"
                                        title="<?php echo tf_e($itemDesc); ?>"
                                        aria-label="<?php echo tf_e($itemName); ?>"
                                    >
                                        <?php
                                            // Explicit icon in config overrides the auto-fetched
                                            // favicon. Lets users who don't want a Google pingback
                                            // pin their own Boxicon and bypass the favicon service.
                                            $customIcon = isset($item['icon']) ? tf_icon($item['icon'], '') : '';
                                        ?>
                                        <?php if ($customIcon !== ''): ?>
                                            <i class='bx <?php echo tf_e($customIcon); ?> link-btn-icon-fallback'></i>
                                        <?php elseif ($faviconUrl !== ''): ?>
                                            <img src="<?php echo tf_e($faviconUrl); ?>"
                                                 alt=""
                                                 loading="lazy"
                                                 decoding="async"
                                                 class="link-btn-favicon">
                                            <i class='bx bx-link-alt link-btn-icon-fallback' style="display:none;"></i>
                                        <?php else: ?>
                                            <i class='bx bx-link-alt link-btn-icon-fallback'></i>
                                        <?php endif; ?>
                                        <span class="link-btn-text"><?php echo tf_e($itemName); ?></span>
                                        <i class='bx bx-link-alt link-btn-indicator'></i>
                                        <i class='bx bx-star link-btn-favorite'
                                           data-link-id="<?php echo tf_e($itemId); ?>"
                                           role="button"
                                           tabindex="0"
                                           aria-label="Toggle favorite for <?php echo tf_e($itemName); ?>"
                                           aria-pressed="false"
                                           title="Toggle favorite"></i>
                                    </button>

    <?php
}
