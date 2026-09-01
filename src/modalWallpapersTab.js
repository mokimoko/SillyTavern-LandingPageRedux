/**
 * Wallpaper assignment overview, picker, discovery, and refresh flow.
 */
import { getSettings, getLandingPage } from '../index.js';
import { esc } from './utils.js';
import { getExposedTags, getTagDisplayName } from './tagFilter.js';
import {
    getAvailableBackgrounds, wallpaperThumbUrl, backgroundExists,
    setGlobalWallpaper, clearGlobalWallpaper, setTagWallpaper, clearTagWallpaper,
} from './wallpapers.js';

let wpPickerTarget = null;
let wpSearch = '';

export function resetWallpaperTab() {
    wpPickerTarget = null;
    wpSearch = '';
}

// ============================================================
// Tab: Wallpapers
// ============================================================

export function renderWallpapersTab(container) {
    if (wpPickerTarget !== null) { renderWallpaperPicker(container); return; }

    const s = getSettings();
    const exposed = getExposedTags();

    const globalRow = wpAssignmentRow('global', 'Global (default)', s.globalWallpaper || '');

    const tagSection = exposed.length === 0
        ? '<div class="lpm-info-block">Expose tags in the <strong>Tags</strong> tab to assign per-tag wallpapers. A tag\'s wallpaper overrides the global one whenever that filter is active.</div>'
        : exposed.map(t => wpAssignmentRow(t.id, esc(getTagDisplayName(t.id)), s.tagWallpapers?.[t.id] || '')).join('');

    container.innerHTML = `
        <div class="lpm-tab-header">
            <span class="lpm-tab-title">Wallpapers</span>
            <button class="lpm-btn lpm-btn-ghost lpm-wp-refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
        </div>
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
    container.querySelector('.lpm-wp-refresh')?.addEventListener('click', (e) => refreshWallpapers(e.currentTarget));
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
            <div class="lpm-tab-actions">
                <button class="lpm-btn lpm-btn-ghost lpm-wp-refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
                <button class="lpm-btn lpm-btn-ghost" id="lpm-wp-back"><i class="fa-solid fa-arrow-left"></i> Back</button>
            </div>
        </div>
        <input type="text" class="lpm-input-text" id="lpm-wp-search" placeholder="Search backgrounds…" value="${esc(wpSearch)}" style="width:100%;box-sizing:border-box;margin-bottom:10px;">
        <div class="lpm-wp-grid" id="lpm-wp-grid"><div class="lpm-wp-loading">Loading backgrounds…</div></div>
    `;

    container.querySelector('#lpm-wp-back')?.addEventListener('click', () => {
        wpPickerTarget = null;
        wpSearch = '';
        renderWallpapersTab(document.getElementById('lpm-content'));
    });
    container.querySelector('.lpm-wp-refresh')?.addEventListener('click', (e) => refreshWallpapers(e.currentTarget));
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

async function refreshWallpapers(button) {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing…';
    await getAvailableBackgrounds(true);
    getLandingPage()?.refreshBackground?.();
    renderWallpapersTab(document.getElementById('lpm-content'));
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
        <button type="button" class="lpm-wp-tile lpm-wp-tile-none ${current ? '' : 'lpm-wp-tile-active'}" data-file="" title="No wallpaper" aria-pressed="${!current}">
            <i class="fa-regular fa-image"></i><span>None</span>
        </button>`;
    const tiles = list.map(f => `
        <button type="button" class="lpm-wp-tile ${f === current ? 'lpm-wp-tile-active' : ''}" data-file="${esc(f)}" title="${esc(f)}" aria-pressed="${f === current}" style="background-image:${esc(wallpaperThumbUrl(f))}">
            <span class="lpm-wp-tile-name">${esc(f)}</span>
        </button>`).join('');

    const empty = q ? '<div class="lpm-wp-loading">No matches.</div>' : '<div class="lpm-wp-loading">No backgrounds found.</div>';
    grid.innerHTML = noneTile + (list.length ? tiles : empty);
}
