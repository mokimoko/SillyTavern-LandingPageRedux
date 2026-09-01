/**
 * Pure runtime logic shared by browser-facing modules and Node unit tests.
 */

export function filterCharactersByTag(characters, tagMap, tagId) {
    const source = Array.isArray(characters) ? characters : [];
    const filtered = tagId
        ? source.filter(character => Array.isArray(tagMap?.[character.avatar]) && tagMap[character.avatar].includes(tagId))
        : [...source];
    return filtered.sort((a, b) => (b.date_last_chat || 0) - (a.date_last_chat || 0));
}

export function resolveWallpaperFilename(settings, tagId, exists) {
    const hasFile = typeof exists === 'function' ? exists : () => true;
    const tagFile = tagId ? settings?.tagWallpapers?.[tagId] : '';
    if (tagFile && hasFile(tagFile)) return tagFile;
    const globalFile = settings?.globalWallpaper || '';
    return globalFile && hasFile(globalFile) ? globalFile : '';
}

export function createRetryableAsyncCache(loader) {
    let cached;
    let hasCached = false;
    let inFlight = null;

    return {
        get(force = false) {
            if (hasCached && !force) return Promise.resolve(cached);
            if (inFlight) return inFlight;
            inFlight = Promise.resolve()
                .then(loader)
                .then(value => {
                    cached = value;
                    hasCached = true;
                    return value;
                })
                .finally(() => { inFlight = null; });
            return inFlight;
        },
        peek() {
            return hasCached ? cached : undefined;
        },
    };
}

export function getExpressionOverrideFingerprint(overrides) {
    const source = Array.isArray(overrides) ? overrides : [];
    return JSON.stringify(source
        .map(({ name, path }) => [name || '', path || ''])
        .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])));
}

export async function navigateWithState(avatar, setNavigating, navigate) {
    setNavigating(true);
    try {
        const navigated = await navigate(avatar);
        if (!navigated) setNavigating(false);
        return navigated;
    } catch (error) {
        setNavigating(false);
        throw error;
    }
}

export function getPageWindow(totalItems, requestedPage, pageSize) {
    const size = Math.max(1, Math.floor(Number(pageSize) || 1));
    const total = Math.max(0, Math.floor(Number(totalItems) || 0));
    const totalPages = Math.ceil(total / size);
    const page = totalPages === 0
        ? 0
        : Math.min(Math.max(0, Math.floor(Number(requestedPage) || 0)), totalPages - 1);
    const start = page * size;
    return { page, totalPages, start, end: Math.min(total, start + size) };
}
