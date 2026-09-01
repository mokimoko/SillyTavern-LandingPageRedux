/**
 * utils.js — shared helpers for Landing Page Redux.
 */
import { executeSlashCommands } from '../../../../slash-commands.js';

/**
 * Escape a string for safe insertion into HTML (innerHTML / attribute values).
 */
export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Open a character's most recent chat via ST's /go slash command.
 * Caller should set setNavigating(true) BEFORE invoking this to prevent
 * landing-page flicker during the chat-close → chat-open transition.
 */
export async function navigateToChat(avatar) {
    if (!avatar) return false;
    try {
        await executeSlashCommands(`/go ${avatar}`);
        return true;
    } catch (err) {
        console.error('[LPR] navigateToChat failed:', err);
        if (typeof toastr !== 'undefined') {
            toastr.error('Failed to open chat', 'Landing Page');
        }
        return false;
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
