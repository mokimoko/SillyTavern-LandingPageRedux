/**
 * utils.js — shared helpers for Landing Page Redux.
 */
import { executeSlashCommands } from '../../../../slash-commands.js';

const DEBUG = false;

export function log(...args) {
    if (DEBUG) console.log('[LPR]', ...args);
}

/**
 * Normalize an ST avatar filename for comparison (strips extension, lowercases).
 * Used by tag filtering in step 9.
 */
export function cleanAvatar(avatar) {
    if (!avatar) return '';
    return String(avatar).replace(/\.[^/.]+$/, '').toLowerCase();
}

/**
 * Open a character's most recent chat via ST's /go slash command.
 * Caller should set setNavigating(true) BEFORE invoking this to prevent
 * landing-page flicker during the chat-close → chat-open transition.
 */
export async function navigateToChat(avatar) {
    if (!avatar) return;
    try {
        await executeSlashCommands(`/go ${avatar}`);
    } catch (err) {
        console.error('[LPR] navigateToChat failed:', err);
        if (typeof toastr !== 'undefined') {
            toastr.error('Failed to open chat', 'Landing Page');
        }
    }
}

/**
 * Run an arbitrary ST slash command (used by the sidebar custom-button menu).
 * Swallows/logs errors so a bad command can't break the landing page.
 */
export async function runSlashCommand(command) {
    if (!command) return;
    try {
        await executeSlashCommands(command);
    } catch (err) {
        console.error('[LPR] runSlashCommand failed:', command, err);
        if (typeof toastr !== 'undefined') {
            toastr.error('Command failed', 'Landing Page');
        }
    }
}

/**
 * Relative-time formatter for the future card view "last chatted" label.
 * Reserved for step 11+.
 */
export function formatRelativeDate(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}
