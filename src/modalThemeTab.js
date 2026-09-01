/**
 * Theme chooser and background-overlay controls.
 */
import { getSettings } from '../index.js';
import { esc } from './utils.js';
import { getThemes, getCurrentTheme, setCurrentTheme, setOverlayOpacity } from './themeManager.js';

// ============================================================
// Tab: Theme
// ============================================================

export function renderThemeTab(container) {
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
