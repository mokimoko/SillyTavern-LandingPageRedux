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
import { saveSettingsDebounced } from '../../../../../script.js';
import { getSettings } from '../index.js';

// cacheKey "avatar-expression" → URL or null
const expressionCache = new Map();

// How long to wait on a single HEAD probe before aborting. A real 404 comes
// back in single-digit ms on a LAN; this cap only exists to stop a genuinely
// hung request from stalling the batch. 1500ms was needlessly generous and let
// spriteless libraries stack multi-second tails; 600ms is ample headroom.
const PROBE_TIMEOUT_MS = 600;

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
        const cacheKey = `${avatar}-${expression}`;
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
    const cacheKey = `${avatar}-${expression}`;
    if (!expressionCache.has(cacheKey)) return undefined; // not yet looked up
    return expressionCache.get(cacheKey); // url string or null
}

/**
 * Find expression sprite URL for a single character. Cached.
 */
export async function findExpression(characterName, avatarFileName, expression) {
    const cacheKey = `${avatarFileName}-${expression}`;
    if (expressionCache.has(cacheKey)) return expressionCache.get(cacheKey);

    const avatarNoExt = avatarFileName.replace(/\.[^/.]+$/, '');
    const override = extension_settings.expressionOverrides?.find(e => e.name === avatarNoExt);
    const folderName = override?.path || characterName;

    const avatarExt = avatarFileName.match(/\.([^.]+)$/)?.[1];
    const settings = getSettings();
    const exts = [...settings.extensions];
    if (avatarExt && exts.includes(avatarExt)) {
        exts.splice(exts.indexOf(avatarExt), 1);
        exts.unshift(avatarExt);
    }

    for (const ext of exts) {
        const url = `/characters/${folderName}/${expression}.${ext}`;
        try {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
            const resp = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
            clearTimeout(t);
            if (resp.ok) {
                expressionCache.set(cacheKey, url);
                return url;
            }
        } catch {
            // expected when expression doesn't exist
        }
    }

    rememberNegative(cacheKey);
    return null;
}

/**
 * Batch lookup: returns Map<avatar, url|null> for many characters.
 *
 * Each character is resolved independently and concurrently. Within a character,
 * its candidate extensions are probed in parallel and the first existing sprite
 * wins. This avoids the old structure that marched all characters through one
 * extension at a time (png for everyone, then gif for everyone, …), which
 * serialized the per-extension miss latency and could stack into many seconds
 * when characters had no sprites.
 */
export async function findExpressions(characters, expression) {
    const results = new Map();
    const settings = getSettings();
    const exts = [...settings.extensions];

    await Promise.all(characters.map(async char => {
        const cacheKey = `${char.avatar}-${expression}`;
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
    }));

    return results;
}

/**
 * Probe a character's expression sprite across several extensions in parallel.
 * Resolves to the first URL that returns a successful HEAD, or null if none do.
 * A short per-request abort keeps a hung request from stalling the whole probe;
 * a missing file normally 404s quickly, well under the limit.
 */
async function firstExistingSprite(folderName, expression, exts) {
    const probe = (ext) => new Promise(resolve => {
        const url = `/characters/${folderName}/${expression}.${ext}`;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
        fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
            .then(resp => { clearTimeout(t); resolve(resp.ok ? url : null); })
            .catch(() => { clearTimeout(t); resolve(null); });
    });

    // Run all extension probes at once; return the first hit as soon as it lands.
    return new Promise(resolve => {
        let remaining = exts.length;
        let settled = false;
        if (remaining === 0) { resolve(null); return; }
        exts.forEach(ext => {
            probe(ext).then(url => {
                if (settled) return;
                if (url) { settled = true; resolve(url); return; }
                remaining -= 1;
                if (remaining === 0) resolve(null);
            });
        });
    });
}
