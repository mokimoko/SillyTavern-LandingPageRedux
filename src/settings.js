/**
 * settings.js — ST Extensions drawer stub.
 *
 * Tiny control surface in ST's extensions panel: enable toggle,
 * default-view dropdown, and a button to open the full control panel modal.
 * Detailed settings live in the control-panel modal.
 */
import { getSettings, setDefaultView, setLandingPageEnabled } from '../index.js';
import { openLandingModal } from './modal.js';

const DRAWER_HTML = `
<div id="lp-drawer">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Landing Page Redux</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label" for="lp-enabled">
                <input id="lp-enabled" type="checkbox" />
                <span>Enabled</span>
            </label>
            <label class="lp-drawer-label" for="lp-default-view">
                Default view
                <select id="lp-default-view" class="text_pole">
                    <option value="sprite">Sprite (big images)</option>
                    <option value="card">Card (grid)</option>
                </select>
            </label>
            <div class="lp-drawer-actions">
                <button id="lp-open-panel" class="menu_button" style="width:100%;white-space:nowrap;justify-content:center;">
                    <i class="fa-solid fa-sliders"></i>
                    Open Control Panel
                </button>
            </div>
        </div>
    </div>
</div>
`;

export function initSettings() {
    if (document.getElementById('lp-drawer')) return;

    const settings = getSettings();

    const left = document.getElementById('extensions_settings');
    const right = document.getElementById('extensions_settings2');
    const target = left && right
        ? (right.children.length > left.children.length ? left : right)
        : (left || right);
    if (!target) return;
    $(target).append(DRAWER_HTML);

    // Enabled toggle
    const enabledInput = document.getElementById('lp-enabled');
    if (enabledInput) {
        enabledInput.checked = !!settings.enabled;
        enabledInput.addEventListener('change', async (e) => {
            await setLandingPageEnabled(e.target.checked);
        });
    }

    // Default-view dropdown
    const defaultViewSelect = document.getElementById('lp-default-view');
    if (defaultViewSelect) {
        defaultViewSelect.value = settings.defaultView || 'sprite';
        defaultViewSelect.addEventListener('change', (e) => {
            setDefaultView(e.target.value);
        });
    }

    // Control panel button opens the full modal.
    const openPanelBtn = document.getElementById('lp-open-panel');
    if (openPanelBtn) {
        openPanelBtn.addEventListener('click', () => openLandingModal());
    }
}

export function syncSettingsControls(settings = getSettings()) {
    const enabled = !!settings.enabled;
    const view = settings.defaultView === 'card' ? 'card' : 'sprite';
    const drawerEnabled = document.getElementById('lp-enabled');
    const modalEnabled = document.getElementById('lpm-enabled');
    const drawerView = document.getElementById('lp-default-view');
    const modalView = document.getElementById('lpm-default-view');
    if (drawerEnabled) drawerEnabled.checked = enabled;
    if (modalEnabled) modalEnabled.checked = enabled;
    if (drawerView) drawerView.value = view;
    if (modalView) modalView.value = view;
}

export function destroySettings() {
    document.getElementById('lp-drawer')?.remove();
}
