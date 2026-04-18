/**
 * TriggerForge — Config Editor (admin.php companion).
 *
 * Renders a CRUD UI over window.__TF_INITIAL_CONFIG__. Every input
 * mutates the in-memory `cfg` object on blur / change; the Save button
 * POSTs the whole object to api/import.php which validates + backs up
 * + writes. Zero build, no framework.
 */
(function () {
    'use strict';

    const INITIAL = window.__TF_INITIAL_CONFIG__;
    let cfg = (INITIAL && typeof INITIAL === 'object' && !Array.isArray(INITIAL)) ? INITIAL : {};

    const body = document.getElementById('adminBody');
    const addCatBtn = document.getElementById('adminAddCatBtn');
    const saveBtn = document.getElementById('adminSaveBtn');

    // ----- toast (minimal copy of showToast) -----
    function toast(message, type) {
        type = type || 'info';
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const icons = { success: 'bx-check-circle', error: 'bx-alert-circle', warning: 'bx-alert-triangle', info: 'bx-info-circle' };
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        const i = document.createElement('i');
        i.className = 'bx ' + (icons[type] || icons.info) + ' toast-icon';
        i.setAttribute('aria-hidden', 'true');
        const content = document.createElement('div');
        content.className = 'toast-content';
        const msg = document.createElement('div');
        msg.className = 'toast-message';
        msg.textContent = String(message);
        content.appendChild(msg);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'toast-close';
        close.setAttribute('aria-label', 'Close');
        const x = document.createElement('i');
        x.className = 'bx bx-x';
        x.setAttribute('aria-hidden', 'true');
        close.appendChild(x);
        close.addEventListener('click', () => el.remove());
        el.appendChild(i);
        el.appendChild(content);
        el.appendChild(close);
        container.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.remove(); }, 4500);
    }

    // ----- generic modal (minimal copy of openModal) -----
    let _modalReturnFocus = null;
    function _initModal() {
        const modal = document.getElementById('genericModal');
        const backdrop = document.getElementById('genericModalBackdrop');
        const btnClose = document.getElementById('genericModalBtnClose');
        if (!modal || !backdrop) return;
        const close = () => _closeModal();
        if (btnClose) btnClose.addEventListener('click', close);
        backdrop.addEventListener('click', close);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) close();
        });
    }
    function openModal(opts) {
        const o = opts || {};
        const modal = document.getElementById('genericModal');
        const backdrop = document.getElementById('genericModalBackdrop');
        const titleEl = document.getElementById('genericModalTitle');
        const iconEl = document.getElementById('genericModalIcon');
        const bodyEl = document.getElementById('genericModalBody');
        const footerEl = document.getElementById('genericModalFooter');
        if (!modal || !backdrop || !titleEl || !bodyEl || !footerEl) return null;

        titleEl.textContent = String(o.title || '');
        if (iconEl) {
            const safe = typeof o.icon === 'string' && /^bx[a-z]*-[a-z0-9-]+$/.test(o.icon) ? o.icon : 'bx-info-circle';
            iconEl.className = 'bx ' + safe + ' generic-modal-icon';
        }
        bodyEl.innerHTML = '';
        if (o.bodyEl instanceof Node) bodyEl.appendChild(o.bodyEl);
        else if (typeof o.bodyText === 'string') bodyEl.textContent = o.bodyText;

        footerEl.innerHTML = '';
        (o.actions || []).forEach((a) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'generic-modal-btn generic-modal-btn-' + (a.variant || 'default');
            if (a.icon) {
                const i = document.createElement('i');
                i.className = 'bx ' + a.icon;
                i.setAttribute('aria-hidden', 'true');
                btn.appendChild(i);
            }
            const label = document.createElement('span');
            label.textContent = a.label || 'OK';
            btn.appendChild(label);
            btn.addEventListener('click', () => {
                let shouldClose = true;
                if (typeof a.onClick === 'function') {
                    try {
                        if (a.onClick() === false) shouldClose = false;
                    } catch (err) { console.error(err); }
                }
                if (shouldClose) _closeModal();
            });
            footerEl.appendChild(btn);
        });

        _modalReturnFocus = document.activeElement;
        backdrop.classList.add('active');
        modal.classList.add('active');
        modal.removeAttribute('aria-hidden');
        backdrop.removeAttribute('aria-hidden');
        modal.removeAttribute('inert');
        backdrop.removeAttribute('inert');
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            if (!modal.classList.contains('active')) return;
            const first = footerEl.querySelector('.generic-modal-btn-primary') || footerEl.querySelector('.generic-modal-btn') || document.getElementById('genericModalBtnClose');
            if (first) first.focus();
        }, 100);
    }
    function _closeModal() {
        const modal = document.getElementById('genericModal');
        const backdrop = document.getElementById('genericModalBackdrop');
        if (!modal || !backdrop || !modal.classList.contains('active')) return;
        modal.classList.remove('active');
        backdrop.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        backdrop.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');
        backdrop.setAttribute('inert', '');
        document.body.style.overflow = '';
        if (_modalReturnFocus && typeof _modalReturnFocus.focus === 'function') {
            try { _modalReturnFocus.focus(); } catch (e) {}
        }
        _modalReturnFocus = null;
    }

    function confirmDialog(title, message, onYes) {
        const p = document.createElement('p');
        p.textContent = message;
        openModal({
            title: title,
            icon: 'bx-error-circle',
            bodyEl: p,
            actions: [
                { label: 'Cancel', variant: 'default', icon: 'bx-x' },
                { label: 'Confirm', variant: 'danger', icon: 'bx-check', onClick: onYes }
            ]
        });
    }

    // ----- small DOM helper -----
    function h(tag, attrs, children) {
        const el = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach((k) => {
            if (k === 'className') el.className = attrs[k];
            else if (k === 'onClick') el.addEventListener('click', attrs[k]);
            else if (k === 'onChange') el.addEventListener('change', attrs[k]);
            else if (k === 'onBlur') el.addEventListener('blur', attrs[k]);
            else if (k === 'textContent') el.textContent = attrs[k];
            else if (k === 'innerHTML') el.innerHTML = attrs[k];
            else el.setAttribute(k, attrs[k]);
        });
        (children || []).forEach((c) => {
            if (c == null) return;
            el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        return el;
    }

    // ----- data helpers -----
    function isEditableIndex(key) {
        // Skip reserved meta keys; only integer or numeric-string keys are items.
        return !(typeof key === 'string' && key.length > 0 && key[0] === '_');
    }
    function newItem(type) {
        if (type === 'link') {
            return { type: 'link', name: 'New link', url: '' };
        }
        return { type: 'webhook', name: 'New webhook', webhook_url_test: '', webhook_url_prod: '' };
    }

    // ----- render -----
    function render() {
        body.innerHTML = '';
        const catNames = Object.keys(cfg);
        if (catNames.length === 0) {
            body.appendChild(h('div', { className: 'admin-empty' }, [
                h('i', { className: 'bx bxs-rocket admin-empty-icon', 'aria-hidden': 'true' }),
                h('p', {}, ['No categories yet. Use "Add category" to get started.'])
            ]));
            return;
        }
        catNames.forEach((catName) => {
            body.appendChild(renderCategory(catName));
        });
    }

    function renderCategory(catName) {
        const items = cfg[catName];
        const section = h('section', { className: 'admin-category', 'data-category': catName });

        // Header
        const header = h('header', { className: 'admin-category-header' });
        const nameInput = h('input', {
            type: 'text', className: 'admin-cat-name', value: catName,
            'aria-label': 'Category name'
        });
        nameInput.value = catName;
        nameInput.addEventListener('change', () => {
            const newName = nameInput.value.trim();
            if (newName === '' || newName === catName) { nameInput.value = catName; return; }
            if (cfg.hasOwnProperty(newName)) {
                toast('A category named "' + newName + '" already exists', 'error');
                nameInput.value = catName;
                return;
            }
            renameCategory(catName, newName);
        });
        header.appendChild(nameInput);

        const addItemBtn = h('button', {
            type: 'button',
            className: 'admin-btn admin-btn-default admin-btn-sm',
            onClick: () => pickItemType(catName)
        }, [h('i', { className: 'bx bx-plus' }), h('span', {}, ['Add item'])]);
        header.appendChild(addItemBtn);

        const delCatBtn = h('button', {
            type: 'button',
            className: 'admin-btn admin-btn-danger admin-btn-sm',
            onClick: () => confirmDialog(
                'Delete category?',
                'Remove category "' + catName + '" and all its items? This can\'t be undone (except by reverting to a backup).',
                () => { deleteCategory(catName); }
            )
        }, [h('i', { className: 'bx bx-trash' }), h('span', {}, ['Delete'])]);
        header.appendChild(delCatBtn);
        section.appendChild(header);

        // Items
        const list = h('div', { className: 'admin-items' });
        if (!Array.isArray(items)) {
            list.appendChild(h('p', { className: 'admin-warning' }, [
                'This category\'s value isn\'t an array — skipping. Fix in a file editor.'
            ]));
        } else {
            items.forEach((item, idx) => {
                if (!isEditableIndex(idx)) return;
                if (!item || typeof item !== 'object') return;
                list.appendChild(renderItem(catName, idx, item));
            });
        }
        section.appendChild(list);
        return section;
    }

    function renderItem(catName, idx, item) {
        const type = (item.type === 'link') ? 'link' : 'webhook';
        const row = h('div', { className: 'admin-item admin-item-' + type, 'data-idx': String(idx) });

        const typeLabel = h('span', { className: 'admin-item-type' }, [type]);
        row.appendChild(typeLabel);

        const mainCol = h('div', { className: 'admin-item-main' });
        mainCol.appendChild(field('Name', 'text', item.name || '', (v) => { item.name = v; }, true));
        mainCol.appendChild(field('ID (optional)', 'text', item.id || '', (v) => {
            if (v === '') delete item.id; else item.id = v;
        }));

        if (type === 'webhook') {
            mainCol.appendChild(field('Test URL', 'url', item.webhook_url_test || '', (v) => { item.webhook_url_test = v; }));
            mainCol.appendChild(field('Prod URL', 'url', item.webhook_url_prod || '', (v) => { item.webhook_url_prod = v; }));
        } else {
            mainCol.appendChild(field('URL', 'url', item.url || '', (v) => { item.url = v; }));
        }
        row.appendChild(mainCol);

        // Advanced (collapsed by default)
        const advWrap = h('details', { className: 'admin-item-advanced' });
        const summary = h('summary', {}, ['Advanced']);
        advWrap.appendChild(summary);
        const advGrid = h('div', { className: 'admin-adv-grid' });
        advGrid.appendChild(field('Icon (bx-...)', 'text', item.icon || '', (v) => {
            if (v === '') delete item.icon; else item.icon = v;
        }));
        advGrid.appendChild(field('Description', 'text', item.description || '', (v) => {
            if (v === '') delete item.description; else item.description = v;
        }));
        if (type === 'webhook') {
            advGrid.appendChild(field('Cooldown (ms, 0=off)', 'number', item.cooldown == null ? '' : String(item.cooldown), (v) => {
                if (v === '') { delete item.cooldown; return; }
                const n = parseInt(v, 10);
                if (!isNaN(n) && n >= 0) item.cooldown = n;
            }));
            advGrid.appendChild(checkbox('Require confirmation', item.confirm !== false, (v) => {
                if (v) delete item.confirm; else item.confirm = false;
            }));
            advGrid.appendChild(selectField('Method', ['POST', 'GET', 'PUT', 'PATCH', 'DELETE'], item.method || 'POST', (v) => {
                if (v === 'POST') delete item.method; else item.method = v;
            }));
            advGrid.appendChild(jsonField('Headers (JSON object)', item.headers || {}, (v) => {
                if (v == null || (typeof v === 'object' && Object.keys(v).length === 0)) delete item.headers;
                else item.headers = v;
            }));
            advGrid.appendChild(jsonField('Payload (JSON object)', item.payload || {}, (v) => {
                if (v == null || (typeof v === 'object' && Object.keys(v).length === 0)) delete item.payload;
                else item.payload = v;
            }));
        }
        advWrap.appendChild(advGrid);
        row.appendChild(advWrap);

        // Actions column
        const actions = h('div', { className: 'admin-item-actions' });
        actions.appendChild(h('button', {
            type: 'button', className: 'admin-icon-btn', title: 'Duplicate',
            'aria-label': 'Duplicate item',
            onClick: () => duplicateItem(catName, idx)
        }, [h('i', { className: 'bx bx-copy' })]));
        actions.appendChild(h('button', {
            type: 'button', className: 'admin-icon-btn admin-icon-btn-danger', title: 'Delete',
            'aria-label': 'Delete item',
            onClick: () => confirmDialog(
                'Delete item?',
                'Remove "' + (item.name || '(unnamed)') + '" from "' + catName + '"?',
                () => { deleteItem(catName, idx); }
            )
        }, [h('i', { className: 'bx bx-trash' })]));
        row.appendChild(actions);

        return row;
    }

    // ----- field factories -----
    function field(label, type, value, onChange, required) {
        const wrap = h('label', { className: 'admin-field' });
        wrap.appendChild(h('span', { className: 'admin-field-label' }, [label + (required ? ' *' : '')]));
        const inp = h('input', { type: type, className: 'admin-input', value: value });
        inp.value = value;
        if (required) inp.setAttribute('required', 'required');
        inp.addEventListener('change', () => onChange(inp.value));
        wrap.appendChild(inp);
        return wrap;
    }
    function selectField(label, options, value, onChange) {
        const wrap = h('label', { className: 'admin-field' });
        wrap.appendChild(h('span', { className: 'admin-field-label' }, [label]));
        const sel = document.createElement('select');
        sel.className = 'admin-input';
        options.forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            if (o === value) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', () => onChange(sel.value));
        wrap.appendChild(sel);
        return wrap;
    }
    function checkbox(label, checked, onChange) {
        const wrap = h('label', { className: 'admin-field admin-field-inline' });
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!checked;
        inp.addEventListener('change', () => onChange(inp.checked));
        wrap.appendChild(inp);
        wrap.appendChild(h('span', { className: 'admin-field-label' }, [label]));
        return wrap;
    }
    function jsonField(label, value, onChange) {
        const wrap = h('label', { className: 'admin-field' });
        wrap.appendChild(h('span', { className: 'admin-field-label' }, [label]));
        const ta = document.createElement('textarea');
        ta.className = 'admin-input admin-textarea';
        ta.rows = 3;
        ta.value = JSON.stringify(value || {}, null, 2);
        ta.addEventListener('blur', () => {
            const raw = ta.value.trim();
            if (raw === '' || raw === '{}') {
                ta.classList.remove('admin-input-error');
                onChange(null);
                return;
            }
            try {
                const parsed = JSON.parse(raw);
                if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    ta.classList.add('admin-input-error');
                    toast(label + ': must be a JSON object', 'error');
                    return;
                }
                ta.classList.remove('admin-input-error');
                onChange(parsed);
            } catch (e) {
                ta.classList.add('admin-input-error');
                toast(label + ': invalid JSON — ' + e.message, 'error');
            }
        });
        wrap.appendChild(ta);
        return wrap;
    }

    // ----- mutations -----
    function renameCategory(oldName, newName) {
        const rebuilt = {};
        Object.keys(cfg).forEach((k) => {
            rebuilt[k === oldName ? newName : k] = cfg[k];
        });
        cfg = rebuilt;
        render();
    }
    function deleteCategory(catName) {
        delete cfg[catName];
        render();
    }
    function addCategory() {
        const name = (window.prompt && window.prompt('New category name:', 'New category')) || '';
        const trimmed = String(name).trim();
        if (trimmed === '') return;
        if (cfg.hasOwnProperty(trimmed)) { toast('Category already exists', 'warning'); return; }
        cfg[trimmed] = [];
        render();
    }
    function pickItemType(catName) {
        openModal({
            title: 'Add item to "' + catName + '"',
            icon: 'bx-plus-circle',
            bodyEl: h('p', {}, ['Which kind of item?']),
            actions: [
                { label: 'Webhook', variant: 'primary', icon: 'bx-bolt',
                  onClick: () => { addItem(catName, 'webhook'); } },
                { label: 'Link', variant: 'default', icon: 'bx-link-alt',
                  onClick: () => { addItem(catName, 'link'); } },
                { label: 'Cancel', variant: 'default', icon: 'bx-x' }
            ]
        });
    }
    function addItem(catName, type) {
        if (!Array.isArray(cfg[catName])) cfg[catName] = [];
        cfg[catName].push(newItem(type));
        render();
    }
    function deleteItem(catName, idx) {
        if (!Array.isArray(cfg[catName])) return;
        cfg[catName].splice(idx, 1);
        render();
    }
    function duplicateItem(catName, idx) {
        if (!Array.isArray(cfg[catName])) return;
        const orig = cfg[catName][idx];
        if (!orig) return;
        const copy = JSON.parse(JSON.stringify(orig));
        copy.name = (copy.name || 'Item') + ' (copy)';
        // Drop explicit id — forces a fresh one to avoid duplicates.
        delete copy.id;
        cfg[catName].splice(idx + 1, 0, copy);
        render();
    }

    // ----- save -----
    function save() {
        saveBtn.disabled = true;
        fetch('api/import.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg)
        })
        .then(async (r) => {
            let data = {};
            try { data = await r.json(); } catch (e) {}
            if (r.ok && data.success) {
                toast('Saved — config written', 'success');
            } else if (r.status === 422 && Array.isArray(data.errors)) {
                showValidationErrors(data.errors);
            } else {
                toast('Save failed: ' + (data.message || ('HTTP ' + r.status)), 'error');
            }
        })
        .catch((err) => toast('Save request failed: ' + err.message, 'error'))
        .finally(() => { saveBtn.disabled = false; });
    }
    function showValidationErrors(errors) {
        const ul = document.createElement('ul');
        ul.style.margin = '0';
        ul.style.paddingLeft = '1.25em';
        errors.forEach((m) => {
            const li = document.createElement('li');
            li.textContent = String(m);
            li.style.marginBottom = '4px';
            ul.appendChild(li);
        });
        openModal({
            title: 'Validation failed — config not saved',
            icon: 'bx-error-circle',
            bodyEl: ul,
            actions: [{ label: 'Close', variant: 'default', icon: 'bx-x' }]
        });
    }

    // ----- boot -----
    _initModal();
    if (addCatBtn) addCatBtn.addEventListener('click', addCategory);
    if (saveBtn) saveBtn.addEventListener('click', save);
    render();
})();
