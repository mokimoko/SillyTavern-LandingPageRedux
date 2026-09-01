/**
 * Versioned Landing Page Redux settings defaults and normalization.
 */

export const DEFAULT_SETTINGS = {
    schemaVersion: 1,
    enabled: true,
    defaultView: 'sprite',
    cardNumCards: 10,
    hideNames: false,
    useExpressions: true,
    expression: 'neutral',
    extensions: ['png', 'gif', 'webp'],
    exposedTags: [],
    tagDisplayNames: {},
    defaultTagFilter: null,
    globalWallpaper: '',
    tagWallpapers: {},
    tagViewModes: {},
    menuItems: [],
    currentTheme: 'glass',
    overlayOpacity: 35,
    avatarScale: 100,
    spriteNegCache: [],
};

function isRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function uniqueStrings(value, { lower = false, pattern = null } = {}) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .map(item => String(item || '').trim())
        .map(item => lower ? item.toLowerCase() : item)
        .filter(item => item && (!pattern || pattern.test(item))))];
}

function stringRecord(value, validateValue = () => true) {
    if (!isRecord(value)) return {};
    return Object.fromEntries(Object.entries(value)
        .map(([key, entry]) => [String(key).trim(), String(entry ?? '').trim()])
        .filter(([key, entry]) => key && entry && validateValue(entry)));
}

export function normalizeSettings(raw) {
    const source = isRecord(raw) ? raw : {};
    const extensions = uniqueStrings(source.extensions, { lower: true, pattern: /^[a-z0-9]{1,10}$/ });
    const menuItems = Array.isArray(source.menuItems)
        ? source.menuItems.filter(isRecord).map(item => ({
            label: String(item.label || '').trim(),
            icon: String(item.icon || '').trim(),
            command: String(item.command || '').trim(),
        }))
        : [];

    return {
        schemaVersion: DEFAULT_SETTINGS.schemaVersion,
        enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_SETTINGS.enabled,
        defaultView: ['sprite', 'card'].includes(source.defaultView) ? source.defaultView : DEFAULT_SETTINGS.defaultView,
        cardNumCards: clampNumber(source.cardNumCards, 4, 50, DEFAULT_SETTINGS.cardNumCards),
        hideNames: typeof source.hideNames === 'boolean' ? source.hideNames : DEFAULT_SETTINGS.hideNames,
        useExpressions: typeof source.useExpressions === 'boolean' ? source.useExpressions : DEFAULT_SETTINGS.useExpressions,
        expression: String(source.expression || DEFAULT_SETTINGS.expression).trim() || DEFAULT_SETTINGS.expression,
        extensions: extensions.length ? extensions : [...DEFAULT_SETTINGS.extensions],
        exposedTags: uniqueStrings(source.exposedTags),
        tagDisplayNames: stringRecord(source.tagDisplayNames),
        defaultTagFilter: typeof source.defaultTagFilter === 'string' && source.defaultTagFilter.trim()
            ? source.defaultTagFilter.trim()
            : null,
        globalWallpaper: typeof source.globalWallpaper === 'string' ? source.globalWallpaper.trim() : '',
        tagWallpapers: stringRecord(source.tagWallpapers),
        tagViewModes: stringRecord(source.tagViewModes, value => ['sprite', 'card'].includes(value)),
        menuItems,
        currentTheme: String(source.currentTheme || DEFAULT_SETTINGS.currentTheme).trim() || DEFAULT_SETTINGS.currentTheme,
        overlayOpacity: clampNumber(source.overlayOpacity, 0, 100, DEFAULT_SETTINGS.overlayOpacity),
        avatarScale: clampNumber(source.avatarScale, 50, 150, DEFAULT_SETTINGS.avatarScale),
        spriteNegCache: uniqueStrings(source.spriteNegCache),
    };
}

