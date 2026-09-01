/**
 * Sidebar slash-command button editor.
 */
import { saveSettingsDebounced } from '../../../../../script.js';
import { getSettings, getLandingPage } from '../index.js';
import { esc } from './utils.js';

// ============================================================
// Tab: Buttons
// ============================================================

export function renderButtonsTab(container) {
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
