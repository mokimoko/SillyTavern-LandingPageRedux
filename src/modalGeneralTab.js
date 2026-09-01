/**
 * General and display control-panel tabs.
 */
import { saveSettingsDebounced } from '../../../../../script.js';
import { getSettings, getLandingPage, setDefaultView, setLandingPageEnabled } from '../index.js';
import { esc } from './utils.js';
import { refreshLanding } from './modalShared.js';

// ============================================================
// Tab: General
// ============================================================

export function renderGeneralTab(container) {
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

    $('#lpm-enabled')?.addEventListener('change', async (e) => {
        await setLandingPageEnabled(e.target.checked);
    });
    $('#lpm-default-view')?.addEventListener('change', (e) => {
        setDefaultView(e.target.value);
    });
}

// ============================================================
// Tab: Display
// ============================================================

export function renderDisplayTab(container) {
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
                <div class="lpm-setting-desc">How many character cards to load per page. Scroll the grid to reach additional rows.</div>
            </div>
            <input type="number" class="lpm-input-num" id="lpm-card-num" value="${s.cardNumCards || 10}" min="4" max="50" step="1">
        </div>
        <div class="lpm-setting-item">
            <div class="lpm-setting-info">
                <div class="lpm-setting-title">Avatar / Sprite size</div>
                <div class="lpm-setting-desc">Scale character images up or down. Lower values help at 100% browser zoom.</div>
            </div>
            <div class="lpm-overlay-slider-row" style="flex:0 0 auto;gap:8px;">
                <input type="range" min="50" max="150" step="5" value="${s.avatarScale ?? 100}" class="lpm-overlay-range" id="lpm-avatar-scale" style="width:120px;">
                <span class="lpm-overlay-value" id="lpm-avatar-scale-value">${s.avatarScale ?? 100}%</span>
            </div>
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

    const scaleSlider = $('#lpm-avatar-scale');
    const scaleLabel = $('#lpm-avatar-scale-value');
    if (scaleSlider) {
        scaleSlider.addEventListener('input', () => {
            const val = Number(scaleSlider.value);
            scaleLabel.textContent = `${val}%`;
            s.avatarScale = val;
            saveSettingsDebounced();
            const lp = getLandingPage();
            if (lp) {
                if (lp.currentView === 'sprite') lp.updateSpriteSizing?.();
                else lp.loadCharacters?.();
            }
        });
    }

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
