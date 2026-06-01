/**
 * modal.js — Landing Page Redux control panel.
 *
 * Pattern lifted from SimpleSummarizer's modal: persistent DOM via
 * ensureModalDOM(), a 56px icon rail, tab dispatch, ESC + overlay-click
 * close, and immediate-save settings (no Save button).
 *
 * Prefix is `lpm-` (landing-page-modal), NOT `lp-`, to avoid colliding with
 * the landing page's own classes (.lp-sidebar, .lp-content, etc).
 *
 * Step 7: scaffold only. The six tabs render placeholders; real controls land
 * in step 8 (General/Display), 9 (Tags), 10 (Wallpapers), plus Buttons + Theme.
 */
import { saveSettingsDebounced } from '../../../../../script.js';
import { getSettings, getLandingPage } from '../index.js';
import { clearExpressionCache } from './expressions.js';
import { esc } from './utils.js';
import { getAllTags, getExposedTags, getTagDisplayName } from './tagFilter.js';
import {
    getAvailableBackgrounds, wallpaperThumbUrl, backgroundExists,
    setGlobalWallpaper, clearGlobalWallpaper, setTagWallpaper, clearTagWallpaper,
} from './wallpapers.js';
import { getThemes, getCurrentTheme, setCurrentTheme, setOverlayOpacity } from './themeManager.js';

let isOpen = false;
let activeTab = 'general';
let escHandler = null;

// Wallpapers tab: which target the inline picker is choosing for
// ('global' | tagId), or null when showing the assignment overview.
let wpPickerTarget = null;
let wpSearch = '';

const MODAL_ID = 'lpm-modal';
const OVERLAY_ID = 'lpm-overlay';

const TABS = [
    { id: 'general',    icon: 'fa-gears',   label: 'General' },
    { id: 'display',    icon: 'fa-display', label: 'Display' },
    { id: 'tags',       icon: 'fa-tags',    label: 'Tags' },
    { id: 'wallpapers', icon: 'fa-image',   label: 'Wallpapers' },
    { id: 'buttons',    icon: 'fa-link',    label: 'Buttons' },
    { id: 'theme',      icon: 'fa-palette', label: 'Theme' },
];

// ============================================================
// Open / Close
// ============================================================

export function openLandingModal(tab = null) {
    if (tab && TABS.some(t => t.id === tab)) activeTab = tab;

    if (isOpen) {
        renderContent(); // already open — just switch tab
        return;
    }

    isOpen = true;
    ensureModalDOM();
    renderContent();

    requestAnimationFrame(() => {
        document.getElementById(OVERLAY_ID)?.classList.add('lpm-visible');
        document.getElementById(MODAL_ID)?.classList.add('lpm-visible');
    });
}

export function closeLandingModal() {
    if (!isOpen) return;
    document.getElementById(OVERLAY_ID)?.classList.remove('lpm-visible');
    document.getElementById(MODAL_ID)?.classList.remove('lpm-visible');
    isOpen = false;
    wpPickerTarget = null; // reset wallpaper picker so next open is fresh
    wpSearch = '';
}

export function isLandingModalOpen() {
    return isOpen;
}

// ============================================================
// DOM creation (once)
// ============================================================

function ensureModalDOM() {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'lpm-overlay';
    overlay.addEventListener('click', closeLandingModal);
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'lpm-modal';
    modal.innerHTML = `
        <div class="lpm-header">
            <div class="lpm-title"><i class="fa-solid fa-house"></i> Landing Page Redux</div>
            <div class="lpm-close" id="lpm-close">&times;</div>
        </div>
        <div class="lpm-body">
            <div class="lpm-rail" id="lpm-rail"></div>
            <div class="lpm-content" id="lpm-content"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#lpm-close')?.addEventListener('click', closeLandingModal);

    escHandler = (e) => { if (e.key === 'Escape' && isOpen) closeLandingModal(); };
    document.addEventListener('keydown', escHandler);
}

// ============================================================
// Rail (icon nav) + content dispatch
// ============================================================

function renderRail() {
    const rail = document.getElementById('lpm-rail');
    if (!rail) return;

    rail.innerHTML = TABS.map(t => `
        <div class="lpm-nav-item ${t.id === activeTab ? 'lpm-nav-active' : ''}" data-tab="${t.id}" title="${t.label}">
            <i class="fa-solid ${t.icon}"></i>
        </div>
    `).join('');

    rail.querySelectorAll('.lpm-nav-item').forEach(el => {
        el.addEventListener('click', () => {
            if (el.dataset.tab !== activeTab) { wpPickerTarget = null; wpSearch = ''; }
            activeTab = el.dataset.tab;
            renderContent();
        });
    });
}

function renderContent() {
    renderRail();
    const content = document.getElementById('lpm-content');
    if (!content) return;

    switch (activeTab) {
        case 'general':    renderGeneralTab(content); break;
        case 'display':    renderDisplayTab(content); break;
        case 'tags':       renderTagsTab(content); break;
        case 'wallpapers': renderWallpapersTab(content); break;
        case 'buttons':    renderButtonsTab(content); break;
        case 'theme':      renderThemeTab(content); break;
        default:           renderGeneralTab(content);
    }
}

// ============================================================
// Shared helpers
// ============================================================

/**
 * Re-render the live landing page after a setting change. Pass
 * { expressions: true } to also drop the sprite cache so expression/extension
 * changes are re-discovered rather than served stale from the cache.
 */
function refreshLanding({ expressions = false } = {}) {
    const lp = getLandingPage();
    if (!lp) return;
    if (expressions) clearExpressionCache();
    lp.loadCharacters?.();
}

// ============================================================
// Tab: General
// ============================================================

function renderGeneralTab(container) {
    const s = getSettings();
    container.innerHTML = `
        <div class="lpm-tab-header"><span class="lpm-tab-title">General</span></div>

        <div class="lpm-section-label"><i class="fa-solid fa-gears"></i> General</div>

        <div class="lpm-setting-item">
            <div class="lpm-setting-info">
                <div class="lpm-setting-title">Enable Landing Page</div>
                <div class="lpm-setting-desc">Show the landing page when no chat is open. Takes effect next time the chat closes.</div>
            </div>
            <input type="checkbox" id="lpm-enabled" ${s.enabled ? 'checked' : ''}>
        </div>
        <div class="lpm-divider"></div>

        <div class="lpm-setting-item">
            <div class="lpm-setting-info">
                <div class="lpm-setting-title">Default View</div>
                <div class="lpm-setting-desc">Sprite shows big character images; Card shows a compact avatar grid.</div>
            </div>
            <select class="lpm-select" id="lpm-default-view" style="width:170px;">
                <option value="sprite" ${s.defaultView === 'sprite' ? 'selected' : ''}>Sprite (big images)</option>
                <option value="card" ${s.defaultView === 'card' ? 'selected' : ''}>Card (grid)</option>
            </select>
        </div>
        <div class="lpm-divider"></div>

        <div class="lpm-info-block">
            <strong>/landing</strong> — go to the landing page.<br>
            <strong>/landing on</strong> &middot; <strong>/landing off</strong> — enable or disable it.
        </div>
    `;
    wireGeneralEvents(container);
}

function wireGeneralEvents(container) {
    const $ = (sel) => container.querySelector(sel);
    const s = getSettings();

    $('#lpm-enabled')?.addEventListener('change', (e) => {
        s.enabled = e.target.checked;
        saveSettingsDebounced();
    });
    $('#lpm-default-view')?.addEventListener('change', (e) => {
        s.defaultView = e.target.value;
        saveSettingsDebounced();
        const lp = getLandingPage();
        if (lp && lp.currentView !== s.defaultView) {
            lp.currentView = s.defaultView;
            lp.currentPage = 0;
            lp.cachedCardSizes = null;
            lp.updateViewToggle?.();
            lp.loadCharacters?.();
        }
    });
}

// ============================================================
// Tab: Display
// ============================================================

function renderDisplayTab(container) {
    const s = getSettings();
    const exts = Array.isArray(s.extensions) ? s.extensions.join(', ') : '';
    container.innerHTML = `
        <div class="lpm-tab-header"><span class="lpm-tab-title">Display</span></div>

        <div class="lpm-section-label"><i class="fa-solid fa-display"></i> Cards</div>
        <div class="lpm-setting-item">
            <div class="lpm-setting-info">
                <div class="lpm-setting-title">Hide character names</div>
            </div>
            <input type="checkbox" id="lpm-hide-names" ${s.hideNames ? 'checked' : ''}>
        </div>
        <div class="lpm-setting-item">
            <div class="lpm-setting-info">
                <div class="lpm-setting-title">Cards per page (grid view)</div>
                <div class="lpm-setting-desc">How many character cards to show per page in card/grid view.</div>
            </div>
            <input type="number" class="lpm-input-num" id="lpm-card-num" value="${s.cardNumCards || 10}" min="4" max="50" step="1">
        </div>

        <div class="lpm-divider"></div>

        <div class="lpm-section-label"><i class="fa-solid fa-masks-theater"></i> Sprites</div>
        <div class="lpm-setting-item">
            <div class="lpm-setting-info">
                <div class="lpm-setting-title">Use expression sprites</div>
                <div class="lpm-setting-desc">Use expression images when available, falling back to the card avatar.</div>
            </div>
            <input type="checkbox" id="lpm-use-expr" ${s.useExpressions ? 'checked' : ''}>
        </div>

        <div id="lpm-expr-details" ${s.useExpressions ? '' : 'style="display:none"'}>
            <div class="lpm-setting-item">
                <div class="lpm-setting-info">
                    <div class="lpm-setting-title">Expression</div>
                    <div class="lpm-setting-desc">Sprite name to look for (e.g. neutral, joy).</div>
                </div>
                <input type="text" class="lpm-input-text" id="lpm-expr" value="${esc(s.expression || '')}" placeholder="neutral" style="min-width:140px;">
            </div>
            <div class="lpm-divider"></div>
            <div class="lpm-setting-item-col">
                <label class="lpm-field-label">Image extensions (priority order)</label>
                <input type="text" class="lpm-input-text" id="lpm-exts" value="${esc(exts)}" placeholder="png, gif, webp">
            </div>
        </div>
    `;
    wireDisplayEvents(container);
}

function wireDisplayEvents(container) {
    const $ = (sel) => container.querySelector(sel);
    const s = getSettings();

    $('#lpm-hide-names')?.addEventListener('change', (e) => {
        s.hideNames = e.target.checked;
        saveSettingsDebounced();
        refreshLanding();
    });

    $('#lpm-card-num')?.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        s.cardNumCards = (val >= 4 && val <= 50) ? val : 10;
        e.target.value = s.cardNumCards;
        saveSettingsDebounced();
        const lp = getLandingPage();
        if (lp?.currentView === 'card') lp.loadCharacters?.();
    });

    $('#lpm-use-expr')?.addEventListener('change', (e) => {
        s.useExpressions = e.target.checked;
        saveSettingsDebounced();
        const details = container.querySelector('#lpm-expr-details');
        if (details) details.style.display = e.target.checked ? '' : 'none';
        refreshLanding({ expressions: true });
    });

    $('#lpm-expr')?.addEventListener('change', (e) => {
        s.expression = e.target.value.trim() || 'neutral';
        e.target.value = s.expression;
        saveSettingsDebounced();
        refreshLanding({ expressions: true });
    });

    $('#lpm-exts')?.addEventListener('change', (e) => {
        const arr = e.target.value
            .split(',')
            .map(x => x.trim().toLowerCase().replace(/^\./, ''))
            .filter(Boolean);
        s.extensions = arr.length ? arr : ['png', 'gif', 'webp'];
        e.target.value = s.extensions.join(', ');
        saveSettingsDebounced();
        refreshLanding({ expressions: true });
    });
}

// ============================================================
// Tab: Tags
// ============================================================

function renderTagsTab(container) {
    const s = getSettings();
    const allTags = getAllTags();

    if (allTags.length === 0) {
        container.innerHTML = `
            <div class="lpm-tab-header"><span class="lpm-tab-title">Tags</span></div>
            <div class="lpm-empty-state">
                <i class="fa-solid fa-tags"></i>
                <p>No tags defined in SillyTavern.</p>
                <span class="lpm-empty-hint">Add tags to your characters, then choose which appear here.</span>
            </div>
        `;
        return;
    }

    const exposedSet = new Set(Array.isArray(s.exposedTags) ? s.exposedTags : []);

    // Default-filter options: All Recent + currently-exposed tags (in order)
    const defaultOpts = ['<option value="">All Recent</option>'].concat(
        getExposedTags().map(t =>
            `<option value="${esc(t.id)}" ${s.defaultTagFilter === t.id ? 'selected' : ''}>${esc(getTagDisplayName(t.id))}</option>`),
    );

    const rows = allTags.map(t => {
        const on = exposedSet.has(t.id);
        const dot = t.color
            ? `<span class="lpm-tag-dot" style="background:${esc(t.color)}"></span>`
            : '<span class="lpm-tag-dot lpm-tag-dot-empty"></span>';
        const override = s.tagDisplayNames?.[t.id] || '';
        const renameInput = on
            ? `<input type="text" class="lpm-input-text lpm-tag-rename" data-tag="${esc(t.id)}" value="${esc(override)}" placeholder="${esc(t.name)}" title="Display-name override (landing page only)">`
            : '';
        const viewMode = s.tagViewModes?.[t.id] || '';
        const viewSelect = on
            ? `<select class="lpm-select lpm-tag-view-select" data-tag="${esc(t.id)}" title="View mode for this tag">
                   <option value="" ${!viewMode ? 'selected' : ''}>Default</option>
                   <option value="sprite" ${viewMode === 'sprite' ? 'selected' : ''}>Sprite</option>
                   <option value="card" ${viewMode === 'card' ? 'selected' : ''}>Card</option>
               </select>`
            : '';
        return `
            <div class="lpm-tag-row">
                <label class="lpm-tag-toggle">
                    <input type="checkbox" class="lpm-tag-expose" data-tag="${esc(t.id)}" ${on ? 'checked' : ''}>
                    ${dot}
                    <span class="lpm-tag-name">${esc(t.name)}</span>
                </label>
                ${renameInput}
                ${viewSelect}
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="lpm-tab-header"><span class="lpm-tab-title">Tags</span></div>

        <div class="lpm-section-label"><i class="fa-solid fa-tags"></i> Exposed tags</div>
        <div class="lpm-setting-desc" style="margin-bottom:10px;">
            Choose which tags appear in the landing page's sidebar filter. Renaming here only changes the label shown on the landing page, not the tag itself.
        </div>
        <div class="lpm-tag-list">${rows}</div>

        <div class="lpm-divider"></div>

        <div class="lpm-section-label"><i class="fa-solid fa-filter"></i> Default filter</div>
        <div class="lpm-setting-item">
            <div class="lpm-setting-info">
                <div class="lpm-setting-title">Filter on load</div>
                <div class="lpm-setting-desc">Which filter is active when the landing page opens. Changing the sidebar filter also updates this.</div>
            </div>
            <select class="lpm-select" id="lpm-default-filter" style="width:170px;">
                ${defaultOpts.join('')}
            </select>
        </div>
    `;
    wireTagsEvents(container);
}

function wireTagsEvents(container) {
    const s = getSettings();
    const rerender = () => renderTagsTab(document.getElementById('lpm-content'));

    container.querySelectorAll('.lpm-tag-expose').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = e.target.dataset.tag;
            if (!Array.isArray(s.exposedTags)) s.exposedTags = [];
            if (e.target.checked) {
                if (!s.exposedTags.includes(id)) s.exposedTags.push(id);
            } else {
                s.exposedTags = s.exposedTags.filter(x => x !== id);
                // Un-exposing the current default filter resets it to All Recent
                if (s.defaultTagFilter === id) s.defaultTagFilter = null;
                // Clean up per-tag view mode
                if (s.tagViewModes?.[id]) delete s.tagViewModes[id];
            }
            saveSettingsDebounced();
            getLandingPage()?.refreshTagPicker?.();
            rerender(); // reflect rename-input show/hide + default-filter options
        });
    });

    container.querySelectorAll('.lpm-tag-rename').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = e.target.dataset.tag;
            const val = e.target.value.trim();
            if (!s.tagDisplayNames || typeof s.tagDisplayNames !== 'object') s.tagDisplayNames = {};
            if (val) s.tagDisplayNames[id] = val;
            else delete s.tagDisplayNames[id];
            saveSettingsDebounced();
            getLandingPage()?.refreshTagPicker?.();
            rerender(); // keep default-filter option labels in sync
        });
    });

    container.querySelectorAll('.lpm-tag-view-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const id = e.target.dataset.tag;
            const val = e.target.value; // '' = default, 'sprite', 'card'
            if (!s.tagViewModes || typeof s.tagViewModes !== 'object') s.tagViewModes = {};
            if (val) s.tagViewModes[id] = val;
            else delete s.tagViewModes[id];
            saveSettingsDebounced();
            // If this tag is currently active, switch view live
            const lp = getLandingPage();
            if (lp && (lp.currentTagFilter || null) === (id || null)) {
                const resolved = lp.resolveViewForTag(id);
                if (resolved !== lp.currentView) {
                    lp.currentView = resolved;
                    lp.currentPage = 0;
                    lp.cachedCardSizes = null;
                    lp.updateViewToggle?.();
                    lp.loadCharacters?.();
                }
            }
        });
    });

    container.querySelector('#lpm-default-filter')?.addEventListener('change', (e) => {
        const val = e.target.value || null;
        s.defaultTagFilter = val;          // persist even if landing page isn't live
        saveSettingsDebounced();
        getLandingPage()?.selectTagFilter?.(val); // apply live (also persists + reloads)
    });
}
// ============================================================
// Tab: Wallpapers
// ============================================================

function renderWallpapersTab(container) {
    if (wpPickerTarget !== null) { renderWallpaperPicker(container); return; }

    const s = getSettings();
    const exposed = getExposedTags();

    const globalRow = wpAssignmentRow('global', 'Global (default)', s.globalWallpaper || '');

    const tagSection = exposed.length === 0
        ? '<div class="lpm-info-block">Expose tags in the <strong>Tags</strong> tab to assign per-tag wallpapers. A tag\'s wallpaper overrides the global one whenever that filter is active.</div>'
        : exposed.map(t => wpAssignmentRow(t.id, esc(getTagDisplayName(t.id)), s.tagWallpapers?.[t.id] || '')).join('');

    container.innerHTML = `
        <div class="lpm-tab-header"><span class="lpm-tab-title">Wallpapers</span></div>
        <div class="lpm-section-label"><i class="fa-solid fa-image"></i> Global</div>
        ${globalRow}
        <div class="lpm-divider"></div>
        <div class="lpm-section-label"><i class="fa-solid fa-tags"></i> Per-tag</div>
        ${tagSection}
    `;
    wireWallpaperOverview(container);
}

function wpAssignmentRow(target, label, file) {
    const missing = file && !backgroundExists(file);
    const thumb = file
        ? `<div class="lpm-wp-thumb" style="background-image:${esc(wallpaperThumbUrl(file))}"></div>`
        : '<div class="lpm-wp-thumb lpm-wp-thumb-none"><i class="fa-regular fa-image"></i></div>';
    const name = file
        ? `<span class="lpm-wp-name" title="${esc(file)}">${esc(file)}</span>`
        : '<span class="lpm-wp-name lpm-wp-none-text">None</span>';
    const badge = missing ? '<span class="lpm-wp-missing" title="This file no longer exists">missing</span>' : '';
    const clearBtn = file ? `<button class="lpm-btn lpm-btn-ghost lpm-wp-clear" data-target="${esc(target)}">Clear</button>` : '';
    return `
        <div class="lpm-wp-row">
            ${thumb}
            <div class="lpm-wp-row-main">
                <div class="lpm-wp-row-label">${label}</div>
                <div class="lpm-wp-row-file">${name}${badge}</div>
            </div>
            <div class="lpm-wp-row-actions">
                <button class="lpm-btn lpm-btn-accent lpm-wp-change" data-target="${esc(target)}">Change</button>
                ${clearBtn}
            </div>
        </div>
    `;
}

function wireWallpaperOverview(container) {
    container.querySelectorAll('.lpm-wp-change').forEach(btn => {
        btn.addEventListener('click', () => {
            wpPickerTarget = btn.dataset.target;
            wpSearch = '';
            renderWallpapersTab(document.getElementById('lpm-content'));
        });
    });
    container.querySelectorAll('.lpm-wp-clear').forEach(btn => {
        btn.addEventListener('click', () => wpClear(btn.dataset.target));
    });
}

function wpClear(target) {
    if (target === 'global') clearGlobalWallpaper();
    else clearTagWallpaper(target);
    getLandingPage()?.refreshBackground?.();
    renderWallpapersTab(document.getElementById('lpm-content'));
}

function wpAssign(target, file) {
    if (target === 'global') setGlobalWallpaper(file);
    else setTagWallpaper(target, file);
    wpPickerTarget = null;
    wpSearch = '';
    getLandingPage()?.refreshBackground?.();
    renderWallpapersTab(document.getElementById('lpm-content'));
}

// ---- Inline picker screen ----

function renderWallpaperPicker(container) {
    const label = wpPickerTarget === 'global' ? 'Global (default)' : getTagDisplayName(wpPickerTarget);
    container.innerHTML = `
        <div class="lpm-tab-header">
            <span class="lpm-tab-title">Wallpaper — ${esc(label)}</span>
            <button class="lpm-btn lpm-btn-ghost" id="lpm-wp-back"><i class="fa-solid fa-arrow-left"></i> Back</button>
        </div>
        <input type="text" class="lpm-input-text" id="lpm-wp-search" placeholder="Search backgrounds…" value="${esc(wpSearch)}" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
        <div class="lpm-wp-grid" id="lpm-wp-grid"><div class="lpm-wp-loading">Loading backgrounds…</div></div>
    `;

    container.querySelector('#lpm-wp-back')?.addEventListener('click', () => {
        wpPickerTarget = null;
        wpSearch = '';
        renderWallpapersTab(document.getElementById('lpm-content'));
    });
    container.querySelector('#lpm-wp-search')?.addEventListener('input', (e) => {
        wpSearch = e.target.value;
        populateWpGrid();
    });

    // Event-delegated tile clicks (tiles are rebuilt on every search keystroke)
    container.querySelector('#lpm-wp-grid')?.addEventListener('click', (e) => {
        const tile = e.target.closest('[data-file]');
        if (tile) wpAssign(wpPickerTarget, tile.dataset.file); // empty data-file = None
    });

    populateWpGrid();
}

async function populateWpGrid() {
    const all = await getAvailableBackgrounds();
    const grid = document.getElementById('lpm-wp-grid');
    if (!grid) return; // tab switched/closed while awaiting

    const q = wpSearch.trim().toLowerCase();
    const list = q ? all.filter(f => f.toLowerCase().includes(q)) : all;

    const s = getSettings();
    const current = wpPickerTarget === 'global'
        ? (s.globalWallpaper || '')
        : (s.tagWallpapers?.[wpPickerTarget] || '');

    const noneTile = `
        <div class="lpm-wp-tile lpm-wp-tile-none ${current ? '' : 'lpm-wp-tile-active'}" data-file="" title="No wallpaper">
            <i class="fa-regular fa-image"></i><span>None</span>
        </div>`;
    const tiles = list.map(f => `
        <div class="lpm-wp-tile ${f === current ? 'lpm-wp-tile-active' : ''}" data-file="${esc(f)}" title="${esc(f)}" style="background-image:${esc(wallpaperThumbUrl(f))}">
            <span class="lpm-wp-tile-name">${esc(f)}</span>
        </div>`).join('');

    const empty = q ? '<div class="lpm-wp-loading">No matches.</div>' : '<div class="lpm-wp-loading">No backgrounds found.</div>';
    grid.innerHTML = noneTile + (list.length ? tiles : empty);
}
// ============================================================
// Tab: Buttons
// ============================================================

function renderButtonsTab(container) {
    const s = getSettings();
    if (!Array.isArray(s.menuItems)) s.menuItems = [];
    const items = s.menuItems;

    const rows = items.map((item, i) => buttonRow(item, i, items.length)).join('');
    const list = items.length
        ? `<div class="lpm-btn-list">${rows}</div>`
        : '<div class="lpm-btn-empty">No buttons yet. Add one below.</div>';

    container.innerHTML = `
        <div class="lpm-tab-header"><span class="lpm-tab-title">Buttons</span></div>
        <div class="lpm-section-label"><i class="fa-solid fa-link"></i> Sidebar shortcuts</div>
        <div class="lpm-setting-desc" style="margin-bottom:10px;">
            Custom buttons shown in the landing page sidebar; each runs a slash command when clicked. A label and command are required &mdash; the icon is optional (any Font Awesome class).
        </div>
        ${list}
        <div class="lpm-btn-add-wrap">
            <button class="lpm-btn lpm-btn-accent" id="lpm-btn-add"><i class="fa-solid fa-plus"></i> Add button</button>
        </div>
    `;
    wireButtonsEvents(container);
}

function buttonRow(item, i, total) {
    const icon = (item?.icon || '').trim();
    const preview = icon
        ? `<i class="${esc(icon)}"></i>`
        : '<i class="fa-regular fa-square lpm-btn-preview-empty"></i>';
    return `
        <div class="lpm-btn-row" data-index="${i}">
            <div class="lpm-btn-row-preview" title="Icon preview">${preview}</div>
            <div class="lpm-btn-row-fields">
                <input type="text" class="lpm-input-text lpm-btn-f-label" data-index="${i}" value="${esc(item?.label || '')}" placeholder="Label">
                <div class="lpm-btn-row-sub">
                    <input type="text" class="lpm-input-text lpm-btn-f-icon" data-index="${i}" value="${esc(icon)}" placeholder="fa-solid fa-book">
                    <input type="text" class="lpm-input-text lpm-btn-f-cmd" data-index="${i}" value="${esc(item?.command || '')}" placeholder="/command">
                </div>
            </div>
            <div class="lpm-btn-row-actions">
                <button class="lpm-btn-icon lpm-btn-up" data-index="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-up"></i></button>
                <button class="lpm-btn-icon lpm-btn-down" data-index="${i}" title="Move down" ${i === total - 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-down"></i></button>
                <button class="lpm-btn-icon lpm-btn-del" data-index="${i}" title="Remove"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `;
}

function wireButtonsEvents(container) {
    const s = getSettings();
    const items = s.menuItems;
    const rerender = () => renderButtonsTab(document.getElementById('lpm-content'));
    // Persist + live-refresh the sidebar menu (blank items are skipped by renderMenu).
    const persist = () => { saveSettingsDebounced(); getLandingPage()?.refreshMenu?.(); };

    container.querySelectorAll('.lpm-btn-f-label').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const i = +e.target.dataset.index;
            if (items[i]) { items[i].label = e.target.value.trim(); persist(); }
        });
    });
    container.querySelectorAll('.lpm-btn-f-cmd').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const i = +e.target.dataset.index;
            if (items[i]) { items[i].command = e.target.value.trim(); persist(); }
        });
    });
    // Icon change re-renders so the preview swatch updates (fires on blur, so
    // focus has already left the field — no disruption).
    container.querySelectorAll('.lpm-btn-f-icon').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const i = +e.target.dataset.index;
            if (items[i]) { items[i].icon = e.target.value.trim(); persist(); rerender(); }
        });
    });

    container.querySelectorAll('.lpm-btn-up').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = +btn.dataset.index;
            if (i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; persist(); rerender(); }
        });
    });
    container.querySelectorAll('.lpm-btn-down').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = +btn.dataset.index;
            if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; persist(); rerender(); }
        });
    });
    container.querySelectorAll('.lpm-btn-del').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = +btn.dataset.index;
            items.splice(i, 1); persist(); rerender();
        });
    });

    container.querySelector('#lpm-btn-add')?.addEventListener('click', () => {
        items.push({ label: '', icon: '', command: '' });
        saveSettingsDebounced(); // no refreshMenu: a blank item renders nothing yet
        rerender();
    });
}

// ============================================================
// Tab: Theme
// ============================================================

function renderThemeTab(container) {
    const themes = getThemes();
    const current = getCurrentTheme();

    if (!themes.length) {
        container.innerHTML = `
            <div class="lpm-tab-header"><span class="lpm-tab-title">Theme</span></div>
            <div class="lpm-empty-state">
                <i class="fa-solid fa-palette"></i>
                <p>No themes available yet.</p>
                <span class="lpm-empty-hint">Themes load from themes.json when the landing page initializes.</span>
            </div>
        `;
        return;
    }

    const rows = themes.map(t => themeRow(t, t.id === current)).join('');
    const opacity = getSettings().overlayOpacity ?? 35;
    container.innerHTML = `
        <div class="lpm-tab-header"><span class="lpm-tab-title">Theme</span></div>
        <div class="lpm-section-label"><i class="fa-solid fa-palette"></i> Landing page theme</div>
        <div class="lpm-setting-desc" style="margin-bottom:10px;">
            Sets the landing page's colors and surfaces. Changes apply immediately.
        </div>
        <div class="lpm-theme-list">${rows}</div>
        <div class="lpm-section-label" style="margin-top:18px;"><i class="fa-solid fa-circle-half-stroke"></i> Background overlay</div>
        <div class="lpm-setting-desc" style="margin-bottom:8px;">
            Controls how dark the wallpaper appears behind the landing page.
        </div>
        <div class="lpm-overlay-slider-row">
            <input type="range" min="0" max="100" step="1" value="${opacity}" class="lpm-overlay-range" id="lpm-overlay-range">
            <span class="lpm-overlay-value" id="lpm-overlay-value">${opacity}%</span>
        </div>
    `;
    wireThemeEvents(container);
}

function themeRow(theme, active) {
    const v = theme.variables || {};
    // Pull surface vars for the preview; fall back to sane defaults if a theme
    // omits one. Composed over a checkerboard so translucency is visible.
    const bg = v['--lp-bg-main'] || 'rgba(0,0,0,0.3)';
    const side = v['--lp-sidebar-bg'] || 'linear-gradient(to right, rgba(0,0,0,0.3), rgba(0,0,0,0.15), transparent)';
    const text = v['--lp-text-primary'] || 'rgba(255,255,255,0.9)';
    const edge = v['--lp-border-strong'] || 'rgba(255,255,255,0.18)';
    const swatch = `
        <div class="lpm-theme-swatch">
            <div class="lpm-theme-swatch-bg" style="background:${esc(bg)}"></div>
            <div class="lpm-theme-swatch-side" style="background:${esc(side)};border-right-color:${esc(edge)}"></div>
            <div class="lpm-theme-swatch-dot" style="background:${esc(text)}"></div>
        </div>`;
    return `
        <label class="lpm-theme-row ${active ? 'lpm-theme-row-active' : ''}">
            <input type="radio" name="lpm-theme" class="lpm-theme-radio" value="${esc(theme.id)}" ${active ? 'checked' : ''}>
            ${swatch}
            <span class="lpm-theme-name">${esc(theme.name || theme.id)}</span>
            ${active ? '<i class="fa-solid fa-check lpm-theme-check"></i>' : ''}
        </label>
    `;
}

function wireThemeEvents(container) {
    container.querySelectorAll('.lpm-theme-radio').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (!e.target.checked) return;
            setCurrentTheme(e.target.value);          // persists + applies live
            renderThemeTab(document.getElementById('lpm-content')); // refresh highlight + check
        });
    });

    const slider = container.querySelector('#lpm-overlay-range');
    const label  = container.querySelector('#lpm-overlay-value');
    if (slider) {
        slider.addEventListener('input', () => {
            label.textContent = `${slider.value}%`;
            setOverlayOpacity(Number(slider.value));  // live preview + persist
        });
    }
}
