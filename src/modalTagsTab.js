/**
 * Tag exposure, labels, defaults, and per-tag view controls.
 */
import { saveSettingsDebounced } from '../../../../../script.js';
import { getSettings, getLandingPage } from '../index.js';
import { esc } from './utils.js';
import { getAllTags, getExposedTags, getTagDisplayName } from './tagFilter.js';

// ============================================================
// Tab: Tags
// ============================================================

export function renderTagsTab(container) {
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
