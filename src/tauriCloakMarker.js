const MARKER_NAME = 'bd-lpr-cloak-enabled.css';
const MARKER_PATH = `/user/files/${MARKER_NAME}`;

function getTauriInvoke() {
    return globalThis.window?.__TAURI_INTERNALS__?.invoke;
}

function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

export async function syncTauriCloakMarker(enabled) {
    const invoke = getTauriInvoke();
    if (typeof invoke !== 'function') return;

    try {
        if (!enabled) {
            await invoke('delete_user_file', { path: MARKER_PATH });
            return;
        }

        const response = await fetch(new URL('../assets/tt-cloak-enabled.css', import.meta.url), {
            cache: 'no-store',
        });
        if (!response.ok) throw new Error(`marker asset returned ${response.status}`);

        await invoke('upload_user_file', {
            name: MARKER_NAME,
            data_base64: encodeBase64(await response.text()),
        });
    } catch (error) {
        if (!enabled && /not found/i.test(String(error))) return;
        console.warn('[LPR] Could not sync the TT startup-cloak marker:', error);
    }
}
