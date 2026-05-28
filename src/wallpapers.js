/**
 * wallpapers.js — background wallpaper resolution + ST backgrounds API (step 10).
 *
 * Resolution order for the landing-page background:
 *   per-tag wallpaper (if assigned and the file still exists) → global → none.
 *
 * ST stores backgrounds server-side. We list them via POST /api/backgrounds/all
 * (returns { images: [{ filename, ... }], config }) and build CSS urls the same
 * way ST does: getBackgroundPath(file) → `backgrounds/<encoded>`, wrapped in
 * url("..."). Only the bare filename is persisted in our settings.
 */
import { getRequestHeaders, saveSettingsDebounced } from '../../../../../script.js';
import { getBackgroundPath } from '../../../../backgrounds.js';
import { getSettings } from '../index.js';

// Cache of available background filenames. null = not fetched yet.
let cachedBackgrounds = null;

/** CSS background-image value for a filename, or '' for falsy input. */
export function wallpaperCssUrl(filename) {
    if (!filename) return '';
    return `url("${getBackgroundPath(filename)}")`;
}

/**
 * Fetch the list of available background filenames from ST (cached).
 * @param {boolean} force Re-fetch even if cached.
 * @returns {Promise<string[]>}
 */
export async function getAvailableBackgrounds(force = false) {
    if (cachedBackgrounds && !force) return cachedBackgrounds;
    try {
        const response = await fetch('/api/backgrounds/all', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { images } = await response.json();
        cachedBackgrounds = (images || [])
            .map(x => (typeof x === 'string' ? x : x?.filename))
            .filter(Boolean);
    } catch (err) {
        console.error('[LPR] Failed to list backgrounds:', err);
        cachedBackgrounds = cachedBackgrounds || [];
    }
    return cachedBackgrounds;
}

/**
 * Whether a wallpaper file is known to exist. Best-effort: if the list hasn't
 * been fetched yet, assume it exists (avoids hiding a valid wallpaper on a cold
 * cache); once the list is warm, this reports accurately.
 * @param {string} filename
 * @returns {boolean}
 */
export function backgroundExists(filename) {
    if (!filename) return false;
    if (cachedBackgrounds === null) return true; // cold cache → assume present
    return cachedBackgrounds.includes(filename);
}

/**
 * Resolve the active wallpaper as a CSS background-image value.
 * Per-tag (if assigned and the file exists) → global → '' (none).
 * @param {string|null} tagId Active tag filter, or null for "All Recent".
 * @returns {string} a `url("...")` string, or '' for no wallpaper
 */
export function getActiveWallpaper(tagId) {
    const settings = getSettings();

    if (tagId && settings.tagWallpapers?.[tagId]) {
        const file = settings.tagWallpapers[tagId];
        if (backgroundExists(file)) return wallpaperCssUrl(file);
        // assigned but missing → fall through to global
    }
    return settings.globalWallpaper ? wallpaperCssUrl(settings.globalWallpaper) : '';
}

// ---- Mutators (persist immediately) ----

export function setGlobalWallpaper(filename) {
    getSettings().globalWallpaper = filename || '';
    saveSettingsDebounced();
}

export function clearGlobalWallpaper() {
    getSettings().globalWallpaper = '';
    saveSettingsDebounced();
}

export function setTagWallpaper(tagId, filename) {
    if (!tagId) return;
    const settings = getSettings();
    if (!settings.tagWallpapers || typeof settings.tagWallpapers !== 'object') {
        settings.tagWallpapers = {};
    }
    if (filename) settings.tagWallpapers[tagId] = filename;
    else delete settings.tagWallpapers[tagId];
    saveSettingsDebounced();
}

export function clearTagWallpaper(tagId) {
    const settings = getSettings();
    if (settings.tagWallpapers) delete settings.tagWallpapers[tagId];
    saveSettingsDebounced();
}
