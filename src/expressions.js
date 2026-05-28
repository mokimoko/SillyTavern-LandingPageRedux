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
 * Batch lookup: returns Map<avatar, url|null> for many characters in parallel.
 * More efficient than per-char calls because it batches HEAD requests by extension.
 */
export async function findExpressions(characters, expression) {
    const results = new Map();
    const settings = getSettings();

    for (const ext of settings.extensions) {
        const pending = characters.filter(c => !results.has(c.avatar));
        if (pending.length === 0) break;

        const promises = pending.map(async char => {
            const cacheKey = `${char.avatar}-${expression}`;
            if (expressionCache.has(cacheKey)) {
                return { avatar: char.avatar, url: expressionCache.get(cacheKey) };
            }
            const avatarNoExt = char.avatar.replace(/\.[^/.]+$/, '');
            const override = extension_settings.expressionOverrides?.find(e => e.name === avatarNoExt);
            const folderName = override?.path || char.name;
            const url = `/characters/${folderName}/${expression}.${ext}`;
            try {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 500);
                const resp = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
                if (resp.ok) {
                    expressionCache.set(cacheKey, url);
                    return { avatar: char.avatar, url };
                }
            } catch {
                // expected
            }
            return { avatar: char.avatar, url: null };
        });

        const batch = await Promise.all(promises);
        batch.forEach(({ avatar, url }) => {
            if (url) results.set(avatar, url);
        });
    }

    // Cache null for any character not found
    for (const char of characters) {
        if (!results.has(char.avatar)) {
            expressionCache.set(`${char.avatar}-${expression}`, null);
            results.set(char.avatar, null);
        }
    }
    return results;
}
