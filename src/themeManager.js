/**
 * themeManager.js — apply theme variables to the landing page.
 *
 * Themes are flat JSON (id, name, variables). Variables are written
 * to :root so they cascade to .lp-container regardless of mount order.
 */
import { saveSettingsDebounced } from '../../../../../script.js';
import { getSettings } from '../index.js';

const THEMES_URL = '/scripts/extensions/third-party/SillyTavern-LandingPageRedux/themes.json';

let loadedThemes = [];
let initialized = false;

export async function initTheme() {
    if (initialized) return;
    try {
        const resp = await fetch(THEMES_URL);
        if (resp.ok) {
            const data = await resp.json();
            loadedThemes = data.themes || [];
        }
    } catch (err) {
        console.error('[LPR] Failed to load themes:', err);
        loadedThemes = [];
    }
    initialized = true;

    const settings = getSettings();
    applyTheme(settings.currentTheme || 'glass');
    applyOverlay(settings.overlayOpacity ?? 35);
}

export function getThemes() {
    return [...loadedThemes];
}

export function getCurrentTheme() {
    return getSettings().currentTheme || 'glass';
}

export function applyTheme(themeId) {
    const theme = loadedThemes.find(t => t.id === themeId);
    if (!theme) {
        console.warn(`[LPR] Theme not found: ${themeId}`);
        return;
    }
    const root = document.documentElement;
    for (const [varName, value] of Object.entries(theme.variables || {})) {
        root.style.setProperty(varName, value);
    }
}

export function setCurrentTheme(themeId) {
    const settings = getSettings();
    settings.currentTheme = themeId;
    saveSettingsDebounced();
    applyTheme(themeId);
}

/** Apply overlay opacity (0-100) as a CSS variable on :root. */
export function applyOverlay(opacity) {
    const clamped = Math.max(0, Math.min(100, Number(opacity) || 0));
    document.documentElement.style.setProperty(
        '--lp-bg-overlay',
        `rgba(0, 0, 0, ${(clamped / 100).toFixed(2)})`,
    );
}

/** Persist + apply overlay opacity. */
export function setOverlayOpacity(opacity) {
    const settings = getSettings();
    settings.overlayOpacity = Math.max(0, Math.min(100, Math.round(Number(opacity) || 0)));
    saveSettingsDebounced();
    applyOverlay(settings.overlayOpacity);
}
