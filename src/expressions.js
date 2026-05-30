/**
 * expressions.js — sprite expression URL lookup with module-level cache.
 *
 * Lifted from VerseManager's landingPageRedux, decoupled.
 * Pure utility: takes characters + expression name, returns URL map.
 */
import { extension_settings } from '../../../../extensions.js';
import { getSettings } from '../index.js';

// cacheKey "avatar-expression" → URL or null
const expressionCache = new Map();

export function clearExpressionCache() {
    expressionCache.clear();
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
            const t = setTimeout(() => controller.abort(), 1000);
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

    expressionCache.set(cacheKey, null);
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
        expressionCache.set(cacheKey, url);
        if (url) results.set(char.avatar, url);
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
        const t = setTimeout(() => controller.abort(), 1500);
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
