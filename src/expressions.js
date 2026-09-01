/**
 * expressions.js — sprite expression URL lookup with module-level cache.
 *
 * Lifted from VerseManager's landingPageRedux, decoupled.
 * Pure utility: takes characters + expression name, returns URL map.
 *
 * PERSISTED NEGATIVE CACHE: probing a spriteless character costs one HEAD per
 * candidate extension, and on a library where most characters have no sprites
 * that's dozens–hundreds of 404s on every single page load (the in-memory cache
 * dies on reload, so nothing carried over). We persist the NEGATIVE results —
 * the "avatar-expression" keys confirmed to have no sprite in ANY extension —
 * into extension settings and seed them back into the live cache at module load.
 * So a character that had no sprite last session isn't re-probed this session.
 *
 * Only negatives are persisted. Positives (a real sprite URL) are cheap to
 * re-derive and could change extension, so they're left to the in-memory cache.
 * Invalidation: clearExpressionCache() wipes BOTH the live map and the persisted
 * set — and it's already called when the user toggles the expressions setting
 * (modal.js), so "I added sprites, force a rescan" = toggle expressions off/on.
 */
import { extension_settings } from '../../../../extensions.js';
import { characters as tavernCharacters, saveSettingsDebounced } from '../../../../../script.js';
import { getSettings } from '../index.js';
import { getExpressionOverrideFingerprint } from './runtimeLogic.js';

// cacheKey "avatar-expression" → URL or null
const expressionCache = new Map();
const BATCH_CONCURRENCY = 6;
const PROBE_CONCURRENCY = 2;

// How long to wait on a single HEAD probe before aborting. A real 404 comes
// back in single-digit ms on a LAN; this cap only exists to stop a genuinely
// hung request from stalling the batch. 1500ms was needlessly generous and let
// spriteless libraries stack multi-second tails; 600ms is ample headroom.
const PROBE_TIMEOUT_MS = 600;

function makeCacheKey(avatar, expression) {
    return JSON.stringify([String(avatar || ''), String(expression || '')]);
}

function parseCacheKey(key) {
    try {
        const value = JSON.parse(key);
        return Array.isArray(value) && value.length === 2 ? value : null;
    } catch {
        return null;
    }
}

function encodePathSegment(value) {
    const segment = String(value || '').trim();
    if (!segment || segment === '.' || segment === '..' || /[\\/\u0000-\u001f\u007f]/.test(segment)) return null;
    return encodeURIComponent(segment);
}

function normalizeExtensions(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values
        .map(value => String(value || '').trim().toLowerCase().replace(/^\./, ''))
        .filter(value => /^[a-z0-9]{1,10}$/.test(value)))];
}

function getOverrideFingerprint() {
    const overrides = Array.isArray(extension_settings.expressionOverrides)
        ? extension_settings.expressionOverrides
        : [];
    return getExpressionOverrideFingerprint(overrides);
}

let overrideFingerprint = getOverrideFingerprint();

// ── Persisted negative cache ────────────────────────────────────────────────
// Stored as a plain array of "avatar-expression" keys under settings.spriteNegCache.

function getNegCacheSet() {
    const settings = getSettings();
    if (!Array.isArray(settings.spriteNegCache)) settings.spriteNegCache = [];
    return settings.spriteNegCache;
}

/** Seed persisted negatives into the live map. Called once at module load. */
function seedNegCache() {
    try {
        for (const key of getNegCacheSet()) {
            if (!expressionCache.has(key)) expressionCache.set(key, null);
        }
    } catch { /* settings not ready — will simply re-probe this session */ }
}

/** Record a confirmed negative in both the live map and the persisted set. */
function rememberNegative(cacheKey) {
    expressionCache.set(cacheKey, null);
    try {
        const set = getNegCacheSet();
        if (!set.includes(cacheKey)) {
            set.push(cacheKey);
            saveSettingsDebounced();
        }
    } catch { /* settings not ready — live-map entry still helps this session */ }
}

seedNegCache();

export function clearExpressionCache() {
    expressionCache.clear();
    try {
        const settings = getSettings();
        settings.spriteNegCache = [];
        saveSettingsDebounced();
    } catch { /* */ }
}

function invalidateChangedOverrides() {
    const nextFingerprint = getOverrideFingerprint();
    if (nextFingerprint === overrideFingerprint) return;
    overrideFingerprint = nextFingerprint;
    clearExpressionCache();
}

function pruneExpressionCache(characters, expression) {
    const sourceCharacters = Array.isArray(tavernCharacters) ? tavernCharacters : characters;
    const activeAvatars = new Set(sourceCharacters.map(char => String(char.avatar || '')));
    const isCurrent = (key) => {
        const parsed = parseCacheKey(key);
        return parsed && activeAvatars.has(parsed[0]) && parsed[1] === expression;
    };

    for (const key of expressionCache.keys()) {
        if (!isCurrent(key)) expressionCache.delete(key);
    }

    try {
        const settings = getSettings();
        const current = getNegCacheSet();
        const pruned = current.filter(isCurrent);
        if (pruned.length !== current.length) {
            settings.spriteNegCache = pruned;
            saveSettingsDebounced();
        }
    } catch { /* */ }
}

/**
 * Targeted rescan hook: forget the CACHED NEGATIVES for a specific set of
 * characters (both the live map and the persisted set), so the next
 * findExpressions() actually re-probes them instead of trusting a stale "no
 * sprite" result. Positive (URL) entries are left intact — they're correct and
 * cheap to reuse. Used by the "re-select the active tag = rescan this view"
 * gesture so a user who just added sprite files sees them without nuking the
 * whole cache (which would re-probe their entire spriteless library).
 *
 * @param {string[]} avatars   raw char.avatar keys to forget
 * @param {string}   expression the expression being probed (e.g. 'neutral')
 */
export function forgetNegatives(avatars, expression) {
    if (!Array.isArray(avatars) || !avatars.length) return;
    let mutated = false;
    let set;
    try { set = getNegCacheSet(); } catch { set = null; }

    for (const avatar of avatars) {
        const cacheKey = makeCacheKey(avatar, expression);
        // Only forget confirmed negatives; leave positive URLs cached.
        if (expressionCache.get(cacheKey) === null) {
            expressionCache.delete(cacheKey);
        }
        if (set) {
            const idx = set.indexOf(cacheKey);
            if (idx > -1) { set.splice(idx, 1); mutated = true; }
        }
    }
    if (mutated) {
        try { saveSettingsDebounced(); } catch { /* */ }
    }
}

/**
 * Synchronous cache probe. Returns the cached URL (string) if the character
 * has a sprite, null if it was looked up and confirmed absent, or undefined
 * if the cache has no entry yet (not looked up). Lets callers pick the right
 * layout class at card-creation time without blocking on a network probe.
 */
export function getCachedExpressionUrl(avatar, expression) {
    const cacheKey = makeCacheKey(avatar, expression);
    if (!expressionCache.has(cacheKey)) return undefined; // not yet looked up
    return expressionCache.get(cacheKey); // url string or null
}

/**
 * Batch lookup: returns Map<avatar, url|null> for many characters.
 *
 * Character work runs through a bounded pool. Each character probes a small
 * number of extensions concurrently and aborts the remaining requests on a hit.
 */
export async function findExpressions(characters, expression) {
    invalidateChangedOverrides();
    pruneExpressionCache(characters, expression);

    const results = new Map();
    const settings = getSettings();
    const exts = normalizeExtensions(settings.extensions);

    await mapWithConcurrency(characters, BATCH_CONCURRENCY, async char => {
        const cacheKey = makeCacheKey(char.avatar, expression);
        if (expressionCache.has(cacheKey)) {
            const cached = expressionCache.get(cacheKey);
            if (cached) results.set(char.avatar, cached);
            return;
        }

        const avatarNoExt = char.avatar.replace(/\.[^/.]+$/, '');
        const override = extension_settings.expressionOverrides?.find(e => e.name === avatarNoExt);
        const folderName = override?.path || char.name;

        // Probe every candidate extension for this character concurrently.
        // Resolve with the first URL that exists; null if none do.
        const url = await firstExistingSprite(folderName, expression, exts);
        if (url) {
            expressionCache.set(cacheKey, url);
            results.set(char.avatar, url);
        } else {
            rememberNegative(cacheKey);
        }
    });

    return results;
}

/**
 * Probe a character's expression sprite across several extensions with a small
 * concurrency cap.
 * Resolves to the first URL that returns a successful HEAD, or null if none do.
 * A short per-request abort keeps a hung request from stalling the whole probe;
 * a missing file normally 404s quickly, well under the limit.
 */
async function firstExistingSprite(folderName, expression, exts) {
    const folder = encodePathSegment(folderName);
    const sprite = encodePathSegment(expression);
    const extensions = normalizeExtensions(exts);
    if (!folder || !sprite || extensions.length === 0) return null;

    return new Promise(resolve => {
        const controllers = new Set();
        let nextIndex = 0;
        let active = 0;
        let settled = false;

        const finish = (url) => {
            if (settled) return;
            settled = true;
            controllers.forEach(controller => controller.abort());
            controllers.clear();
            resolve(url);
        };

        const launch = () => {
            while (!settled && active < PROBE_CONCURRENCY && nextIndex < extensions.length) {
                const ext = extensions[nextIndex++];
                const url = `/characters/${folder}/${sprite}.${ext}`;
                const controller = new AbortController();
                controllers.add(controller);
                active++;

                void (async () => {
                    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
                    try {
                        const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
                        if (response.ok) finish(url);
                    } catch { /* missing or aborted */ }
                    finally {
                        clearTimeout(timer);
                        controllers.delete(controller);
                        active--;
                        if (!settled && nextIndex >= extensions.length && active === 0) finish(null);
                        else launch();
                    }
                })();
            }
        };

        launch();
    });
}

async function mapWithConcurrency(items, limit, worker) {
    let nextIndex = 0;
    const run = async () => {
        while (nextIndex < items.length) {
            const item = items[nextIndex++];
            await worker(item);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}
