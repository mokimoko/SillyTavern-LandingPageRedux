/**
 * newChatModal.js — "Start new chat" picker for Landing Page Redux.
 *
 * Standalone port of VerseManager's showNewChatModal, stripped of all verse /
 * storyline / gamemaster coupling. Pick a character + persona (+ optional chat
 * name), then: select character → switch persona if changed → /newchat →
 * rename. Uses ST's native Popup for chrome.
 */
import { characters, getCurrentChatId, renameChat } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { executeSlashCommands } from '../../../../slash-commands.js';
import { getUserAvatars, user_avatar } from '../../../../personas.js';
import { power_user } from '../../../../power-user.js';
import { setNavigating } from '../index.js';
import { esc } from './utils.js';

/** Hide ST's default popup OK/Cancel row (we supply our own buttons). */
function hidePopupControls(popup) {
    setTimeout(() => $(popup.dlg).find('.popup-controls').hide(), 0);
}

export async function showNewChatModal() {
    const context = getContext();

    const availableCharacters = characters
        .filter(c => c.avatar)
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (availableCharacters.length === 0) {
        toastr.info('No characters available', 'Landing Page');
        return false;
    }

    const personaAvatars = await getUserAvatars(false);
    const availablePersonas = personaAvatars.map(avatar => ({
        name: power_user.personas[avatar] || avatar,
        avatar,
        title: power_user.persona_descriptions?.[avatar]?.title || '',
    }));

    const charNameCounts = {};
    availableCharacters.forEach(c => { charNameCounts[c.name] = (charNameCounts[c.name] || 0) + 1; });
    const characterOptions = availableCharacters.map(c => {
        const display = charNameCounts[c.name] > 1 ? `${c.name} (${c.avatar})` : c.name;
        return `<option value="${esc(c.avatar)}">${esc(display)}</option>`;
    }).join('');

    const personaNameCounts = {};
    availablePersonas.forEach(p => { personaNameCounts[p.name] = (personaNameCounts[p.name] || 0) + 1; });
    const personaOptions = availablePersonas.map(p => {
        let display = p.name;
        if (p.title) display = `${p.name} (${p.title})`;
        else if (personaNameCounts[p.name] > 1) display = `${p.name} (${p.avatar})`;
        const sel = p.avatar === user_avatar ? ' selected' : '';
        return `<option value="${esc(p.avatar)}"${sel}>${esc(display)}</option>`;
    }).join('');

    const html = `
        <div class="lpm-new-chat">
            <h3 class="lpm-nc-title">Start new chat</h3>
            <div class="lpm-nc-field">
                <label for="lp-nc-character">Character</label>
                <select id="lp-nc-character" class="text_pole">${characterOptions}</select>
            </div>
            <div class="lpm-nc-field">
                <label for="lp-nc-persona">Persona</label>
                <select id="lp-nc-persona" class="text_pole">${personaOptions}</select>
            </div>
            <div class="lpm-nc-field">
                <label for="lp-nc-name">Chat name (optional)</label>
                <input type="text" id="lp-nc-name" class="text_pole" placeholder="Leave blank for an auto-generated name">
            </div>
            <div class="lpm-nc-footer">
                <button id="lp-nc-create" class="menu_button"><i class="fa-solid fa-plus"></i> Create chat</button>
                <button id="lp-nc-cancel" class="menu_button">Cancel</button>
            </div>
        </div>
    `;

    const popup = new context.Popup(html, 'text', '', { allowVerticalScrolling: true });
    const $popup = $(popup.content);

    return new Promise((resolve) => {
        $popup.find('#lp-nc-create').on('click', async function () {
            const charAvatar = $popup.find('#lp-nc-character').val();
            const personaAvatar = $popup.find('#lp-nc-persona').val();
            const chatName = ($popup.find('#lp-nc-name').val() || '').trim();
            if (!charAvatar) {
                toastr.warning('Please select a character', 'Landing Page');
                return;
            }
            const btn = $(this);
            const original = btn.html();
            btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Creating…');
            try {
                await createNewChat(charAvatar, personaAvatar, chatName);
                popup.complete();
                resolve(true);
            } catch (err) {
                console.error('[LPR] Failed to create chat:', err);
                toastr.error('Failed to create chat', 'Landing Page');
                btn.prop('disabled', false).html(original);
            }
        });
        $popup.find('#lp-nc-cancel').on('click', () => { popup.complete(); resolve(false); });
        popup.show();
        hidePopupControls(popup);
    });
}

async function createNewChat(charAvatar, personaAvatar, chatName) {
    const context = getContext();
    const character = characters.find(c => c.avatar === charAvatar);
    if (!character) throw new Error('Character not found');

    // Leaving the landing page for a chat — suppress its re-show.
    setNavigating(true);

    // Select the character (opens their chat), switch persona if it changed,
    // then start a fresh chat. Brief waits let ST settle between steps.
    const charIndex = characters.indexOf(character);
    await context.selectCharacterById(charIndex);
    await new Promise(r => setTimeout(r, 400));

    if (personaAvatar && personaAvatar !== user_avatar) {
        await executeSlashCommands(`/persona ${personaAvatar}`);
        await new Promise(r => setTimeout(r, 300));
    }

    await executeSlashCommands('/newchat');
    await new Promise(r => setTimeout(r, 300));

    if (chatName) {
        const currentChatName = getCurrentChatId();
        if (currentChatName) {
            await renameChat(currentChatName, chatName);
            await new Promise(r => setTimeout(r, 200));
        }
    }

    toastr.success(`New chat created with ${character.name}`, 'Landing Page');
}
