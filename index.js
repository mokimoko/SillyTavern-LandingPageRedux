/**
 * SillyTavern-LandingPageRedux
 *
 * Replaces ST's default landing page with an immersive character picker.
 * Standalone — does not depend on VerseManager.
 */
import { eventSource, event_types, saveSettings, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { LandingPage } from './src/LandingPage.js';
import { destroySettings, initSettings, syncSettingsControls } from './src/settings.js';
import { clearTheme, initTheme } from './src/themeManager.js';
import { destroyLandingModal } from './src/modal.js';
import { syncTauriCloakMarker } from './src/tauriCloakMarker.js';
import { normalizeSettings } from './src/settingsSchema.js';

export const MODULE_NAME = 'landingPageRedux';

let lp = null;
let appReady = false;
let isNavigating = false;
let startupPromise = null;
let lifecycleEnabled = true;
let chatListenerRegistered = false;
let bootstrapListenersRegistered = false;
let landingCommand = null;

let settingsValidated = false;

export function getSettings() {
    if (!settingsValidated) {
        const current = extension_settings[MODULE_NAME];
        const normalized = normalizeSettings(current);
        const changed = JSON.stringify(current ?? null) !== JSON.stringify(normalized);
        extension_settings[MODULE_NAME] = normalized;
        settingsValidated = true;
        if (changed) saveSettingsDebounced();
    }
    return extension_settings[MODULE_NAME];
}

export async function setLandingPageEnabled(enabled) {
    const settings = getSettings();
    settings.enabled = !!enabled;
    syncSettingsControls(settings);

    // This flag controls UIBedazzler's TT startup cloak, so persist it before
    // returning instead of leaving it queued in the general settings debounce.
    await saveSettings();
    await syncTauriCloakMarker(settings.enabled);

    if (settings.enabled) {
        await initTheme();
        if (appReady) await syncLandingWithCurrentChat();
    } else {
        await teardownLandingUi();
        try { window.__nebulaLiftCloak?.(true); } catch { /* */ }
    }
}

export function setDefaultView(value, { apply = true } = {}) {
    const settings = getSettings();
    settings.defaultView = value === 'card' ? 'card' : 'sprite';
    saveSettingsDebounced();
    syncSettingsControls(settings);

    if (apply && lp) {
        const resolved = lp.resolveViewForTag(lp.currentTagFilter);
        if (lp.currentView !== resolved) {
            lp.currentView = resolved;
            lp.currentPage = 0;
            lp.updateViewToggle?.();
            lp.loadCharacters?.();
        }
    }
    return settings.defaultView;
}

// Resolve the Nebula Loader cloak's fate AS EARLY AS POSSIBLE — at module
// evaluation, not in the APP_READY handler. On setups with many/slow extensions
// APP_READY can fire many seconds into boot, which is too late: the cloak's
// short failsafe lifts at ~1.5s and the bare ST shell flashes before the landing
// page paints. Deciding here — the instant this file is evaluated — fixes that.
//
// The cloak only exists to bridge into the landing page, so:
//   • enabled  → CLAIM it (cancel the failsafe); we lift it on content-ready.
//   • disabled → LIFT it now; there's no landing page coming, so the cloak
//                serves no purpose and should get out of the way immediately
//                instead of pinning ST's UI behind it until APP_READY (+seconds).
//
// (When the landing page isn't installed at all, neither branch runs and the
// plugin's own short failsafe reveals ST promptly — which is exactly right for
// that case.) ST loads extension settings before evaluating extension modules,
// so this `enabled` read is reliable at load time. Both hooks are no-ops when
// nebula-loader isn't installed.
try {
    if (getSettings().enabled) {
        window.__nebulaClaimCloak?.();
    } else {
        window.__nebulaLiftCloak?.();
    }
} catch { /* settings not ready or hook absent — safe to skip */ }

export function setNavigating(value) {
    isNavigating = value;
}

export function getLandingPage() {
    return lp;
}

function restoreSillyTavernShell() {
    const sheld = document.querySelector('#sheld');
    if (sheld) {
        sheld.style.opacity = '';
        sheld.style.pointerEvents = '';
    }
}

async function removeLandingSurface() {
    restoreSillyTavernShell();
    if (lp) {
        const currentPage = lp;
        lp = null;
        await currentPage.cleanup();
    }
    isNavigating = false;
}

async function teardownLandingUi() {
    destroyLandingModal();
    await removeLandingSurface();
    clearTheme();
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
        await removeLandingSurface();
    }
}

async function syncLandingWithCurrentChat() {
    const chatId = getContext().chatId;
    const shouldShow = chatId === undefined && getSettings().enabled;

    if (shouldShow) {
        try { window.__nebulaClaimCloak?.(); } catch { /* */ }
    }

    await onChatChanged(chatId);

    if (!shouldShow) {
        try { window.__nebulaLiftCloak?.(); } catch { /* */ }
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

async function toggleLandingPage(args, value) {
    const input = (value || '').trim().toLowerCase();
    const settings = getSettings();

    if (input === 'on') {
        await setLandingPageEnabled(true);
        toastr.success('Landing Page enabled', 'Landing Page');
        return 'Landing Page enabled';
    }
    if (input === 'off') {
        await setLandingPageEnabled(false);
        toastr.info('Landing Page disabled', 'Landing Page');
        return 'Landing Page disabled';
    }
    return goToLandingPage();
}

async function init() {
    getSettings();
    await initTheme();
    if (!lifecycleEnabled) return;

    initSettings();

    if (!landingCommand) {
        landingCommand = SlashCommand.fromProps({
            name: 'landing',
            callback: toggleLandingPage,
            helpString: '(on|off) – Toggle landing page, or navigate to it. Use "on"/"off" to enable/disable, or no args to go to it.',
        });
        SlashCommandParser.addCommandObject(landingCommand);
    }

    if (!chatListenerRegistered) {
        eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        chatListenerRegistered = true;
    }
}

/**
 * SillyTavern lifecycle hook. The manifest runs this during the blocking load
 * phase, so the landing surface is mounted before the normal UI is interactive.
 */
export async function activate() {
    if (!lifecycleEnabled) return;
    if (startupPromise) return startupPromise;

    startupPromise = (async () => {
        appReady = true;
        await init();
        await syncTauriCloakMarker(getSettings().enabled);
        await syncLandingWithCurrentChat();
    })();

    try {
        return await startupPromise;
    } finally {
        startupPromise = null;
    }
}

export async function onExtensionEnable() {
    lifecycleEnabled = true;
    registerBootstrapListeners();
    await activate();
}

export async function onExtensionDisable() {
    lifecycleEnabled = false;
    appReady = false;
    unregisterRuntimeListeners();
    unregisterLandingCommand();
    destroySettings();
    await teardownLandingUi();
    await syncTauriCloakMarker(false);
}

export async function onExtensionDelete() {
    await onExtensionDisable();
}

// Compatibility fallback for hosts without manifest lifecycle hooks. Current
// ST auto-fires APP_INITIALIZED for late listeners; older builds fall back to
// APP_READY. APP_READY also performs a final refresh after character data and
// other asynchronous startup work have settled.
const bootstrapEvent = event_types.APP_INITIALIZED || event_types.APP_READY;
async function onBootstrap() {
    const startedBeforeEvent = !!startupPromise;
    await activate();
    if (startedBeforeEvent && lifecycleEnabled) await syncLandingWithCurrentChat();
}

async function onAppReady() {
    await activate();
    if (lifecycleEnabled) await syncLandingWithCurrentChat();
}

function registerBootstrapListeners() {
    if (bootstrapListenersRegistered) return;
    if (bootstrapEvent) eventSource.on(bootstrapEvent, onBootstrap);
    if (event_types.APP_READY && event_types.APP_READY !== bootstrapEvent) {
        eventSource.on(event_types.APP_READY, onAppReady);
    }
    bootstrapListenersRegistered = true;
}

function unregisterRuntimeListeners() {
    if (chatListenerRegistered) {
        eventSource.removeListener(event_types.CHAT_CHANGED, onChatChanged);
        chatListenerRegistered = false;
    }
    if (bootstrapListenersRegistered) {
        if (bootstrapEvent) eventSource.removeListener(bootstrapEvent, onBootstrap);
        if (event_types.APP_READY && event_types.APP_READY !== bootstrapEvent) {
            eventSource.removeListener(event_types.APP_READY, onAppReady);
        }
        bootstrapListenersRegistered = false;
    }
}

function unregisterLandingCommand() {
    if (!landingCommand) return;
    for (const [name, command] of Object.entries(SlashCommandParser.commands || {})) {
        if (command === landingCommand) delete SlashCommandParser.commands[name];
    }
    landingCommand = null;
}

registerBootstrapListeners();

