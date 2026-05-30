/**
 * settings.js — ST Extensions drawer stub.
 *
 * Tiny control surface in ST's extensions panel: enable toggle,
 * default-view dropdown, and a button to open the full control panel modal.
 * Real settings live in the modal (built in step 7).
 */
import { saveSettingsDebounced } from '../../../../../script.js';
import { getSettings } from '../index.js';
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
    const settings = getSettings();

    // Append the drawer to ST's extensions panel
    $('#extensions_settings2').append(DRAWER_HTML);

    // Enabled toggle
    const enabledInput = document.getElementById('lp-enabled');
    if (enabledInput) {
        enabledInput.checked = !!settings.enabled;
        enabledInput.addEventListener('change', (e) => {
            settings.enabled = e.target.checked;
            saveSettingsDebounced();
        });
    }

    // Default-view dropdown
    const defaultViewSelect = document.getElementById('lp-default-view');
    if (defaultViewSelect) {
        defaultViewSelect.value = settings.defaultView || 'sprite';
        defaultViewSelect.addEventListener('change', (e) => {
            settings.defaultView = e.target.value;
            saveSettingsDebounced();
        });
    }

    // Control panel button — opens the full modal (step 7)
    const openPanelBtn = document.getElementById('lp-open-panel');
    if (openPanelBtn) {
        openPanelBtn.addEventListener('click', () => openLandingModal());
    }
}
