/**
 * SillyTavern-LandingPageRedux
 *
 * Replaces ST's default landing page with an immersive character picker.
 * Standalone — does not depend on VerseManager.
 */
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { LandingPage } from './src/LandingPage.js';
import { initSettings } from './src/settings.js';
import { initTheme } from './src/themeManager.js';

export const MODULE_NAME = 'landingPageRedux';

let lp = null;
let appReady = false;
let isNavigating = false;

const DEFAULT_SETTINGS = {
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
    userThemes: [],
};

export function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    } else {
        // Ensure new keys exist on installs upgraded from earlier versions
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
            if (extension_settings[MODULE_NAME][k] === undefined) {
                extension_settings[MODULE_NAME][k] = structuredClone(v);
            }
        }
    }
    return extension_settings[MODULE_NAME];
}

export function setNavigating(value) {
    isNavigating = value;
}

export function getLandingPage() {
    return lp;
}

async function onChatChanged(chatId) {
    if (!appReady) return;

    const settings = getSettings();

    if (chatId === undefined && settings.enabled) {
        if (isNavigating) {
            return;
        }
        if (!lp) {
            lp = new LandingPage();
        }
        await lp.show();
    } else {
        // Chat loaded — clean up landing page
        const sheld = document.querySelector('#sheld');
        if (sheld) {
            sheld.style.opacity = '';
            sheld.style.pointerEvents = '';
        }
        if (lp) {
            lp.cleanup();
            lp = null;
        }
        isNavigating = false;
    }
}

async function goToLandingPage() {
    const context = getContext();
    if (context.chatId === undefined) {
        toastr.info('Already on landing page', 'Landing Page');
        return '';
    }
    if (!getSettings().enabled) {
        toastr.warning('Landing Page is disabled', 'Landing Page');
        return '';
    }
    document.getElementById('option_close_chat')?.click();
    return '';
}

function toggleLandingPage(args, value) {
    const input = (value || '').trim().toLowerCase();
    const settings = getSettings();

    if (input === 'on') {
        settings.enabled = true;
        saveSettingsDebounced();
        toastr.success('Landing Page enabled', 'Landing Page');
        if (getContext().chatId === undefined) {
            onChatChanged(undefined);
        }
        return 'Landing Page enabled';
    }
    if (input === 'off') {
        settings.enabled = false;
        saveSettingsDebounced();
        toastr.info('Landing Page disabled', 'Landing Page');
        if (lp) lp.hide();
        const sheld = document.querySelector('#sheld');
        if (sheld) {
            sheld.style.opacity = '';
            sheld.style.pointerEvents = '';
        }
        return 'Landing Page disabled';
    }
    return goToLandingPage();
}

async function init() {
    getSettings(); // ensure populated

    // Load themes + apply current
    await initTheme();

    // Drawer stub in ST extensions panel
    initSettings();

    // /landing slash command
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'landing',
        callback: toggleLandingPage,
        helpString: '(on|off) – Toggle landing page, or navigate to it. Use "on"/"off" to enable/disable, or no args to go to it.',
    }));

    // Chat-state listener
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
}

eventSource.on(event_types.APP_READY, async () => {
    appReady = true;
    await init();

    // Initial show: if no chat is open and we're enabled
    if (getContext().chatId === undefined && getSettings().enabled) {
        // Claim the Nebula Loader cloak BEFORE rendering: our render can take a
        // while (expression sprite lookups, etc.), and we don't want the cloak's
        // short failsafe to lift mid-render and expose the bare ST shell. Claiming
        // cancels that short timer; we lift the cloak ourselves once .lp-loaded is
        // set. No-op when nebula-loader isn't installed.
        try { window.__nebulaClaimCloak?.(); } catch { /* */ }
        await onChatChanged(undefined);
    } else {
        // No landing page is going to paint (disabled, or a chat is already
        // open). If the Nebula Loader handoff cloak is up, lift it now so the
        // real ST UI is revealed immediately instead of waiting out the cloak's
        // own failsafe timer. No-op when nebula-loader isn't installed.
        try { window.__nebulaLiftCloak?.(); } catch { /* */ }
    }
});
