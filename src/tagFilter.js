/**
 * tagFilter.js — tag-based character filtering (step 9).
 *
 * Pure logic over ST's native tag system. ST stores tags in two places:
 *   - `tags`    — array of { id, name, color?, color2?, sort_order?, ... }
 *   - `tag_map` — { [char.avatar]: string[] }  (RAW avatar key → tag IDs)
 *
 * NOTE: tag_map is keyed by the raw `char.avatar` (e.g. "Seraphina.png"),
 * NOT a cleaned/lowercased form. Confirmed against ST core: getTagKeyForEntity
 * resolves the key to `character.avatar`. The gameplan's cleanAvatar()
 * assumption was wrong; we key on the raw avatar here.
 */
import { characters } from '../../../../../script.js';
import { tags, tag_map } from '../../../../tags.js';
import { getSettings } from '../index.js';

/** Sort comparator: most-recently-chatted first; missing dates sort last. */
const byRecent = (a, b) => (b.date_last_chat || 0) - (a.date_last_chat || 0);

/**
 * Characters filtered by a tag, sorted most-recently-chatted first.
 * @param {string|null} tagId Tag ID, or null/falsy for "All Recent".
 * @returns {object[]} a new array (never mutates `characters`)
 */
export function getFilteredCharacters(tagId) {
    if (!tagId) {
        return [...characters].sort(byRecent);
    }
    return characters
        .filter(c => Array.isArray(tag_map[c.avatar]) && tag_map[c.avatar].includes(tagId))
        .sort(byRecent);
}

/**
 * Resolve settings.exposedTags into real ST tag objects, dropping any that no
 * longer exist (deleted in ST). Order follows settings.exposedTags.
 * @returns {object[]} array of ST Tag objects
 */
export function getExposedTags() {
    const settings = getSettings();
    const ids = Array.isArray(settings.exposedTags) ? settings.exposedTags : [];
    return ids
        .map(id => tags.find(t => t.id === id))
        .filter(Boolean);
}

/**
 * Display name for a tag: settings override → ST tag name → fallback.
 * Passing null/falsy returns the "All Recent" label.
 * @param {string|null} tagId
 * @returns {string}
 */
export function getTagDisplayName(tagId) {
    if (!tagId) return 'All Recent';
    const settings = getSettings();
    const override = settings.tagDisplayNames?.[tagId];
    if (override && override.trim()) return override.trim();
    const tag = tags.find(t => t.id === tagId);
    return tag ? tag.name : '(unknown tag)';
}

/**
 * All ST tags, sorted by sort_order then name. Used by the modal's Tags tab
 * to render the full exposable list.
 * @returns {object[]}
 */
export function getAllTags() {
    return [...tags].sort((a, b) => {
        const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (so !== 0) return so;
        return (a.name || '').localeCompare(b.name || '');
    });
}

/**
 * Validate a stored filter selection against what's currently exposed.
 * Returns the tagId only if it's a currently-exposed, existing tag; otherwise
 * null ("All Recent"). Covers the "default points to deleted/un-exposed tag"
 * edge case so a stale setting can't strand the user on an invisible filter.
 * @param {string|null} tagId
 * @returns {string|null}
 */
export function resolveActiveTagFilter(tagId) {
    if (!tagId) return null;
    const exposedIds = getExposedTags().map(t => t.id);
    return exposedIds.includes(tagId) ? tagId : null;
}
