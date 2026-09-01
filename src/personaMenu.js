/**
 * Landing-page persona selector behavior.
 */
import { getUserAvatar, getUserAvatars, setUserAvatar, user_avatar } from '../../../../personas.js';
import { power_user } from '../../../../power-user.js';
import { Popper } from '../../../../../lib.js';
import { esc } from './utils.js';

export class PersonaMenuMethods {
    // ---- Persona selector ----

    async togglePersonaSelector() {
        if (this.personaSelectorOpen || this.personaSelectorOpening) {
            this.closePersonaSelector();
            return;
        }
        await this.openPersonaSelector();
    }

    async openPersonaSelector() {
        const generation = ++this.personaOpenGeneration;
        this.personaSelectorOpening = true;

        // Cached per visit; SETTINGS_UPDATED clears it so new personas still appear
        try {
            if (!this.cachedUserAvatars) {
                this.cachedUserAvatars = await getUserAvatars(false);
            }
        } catch (err) {
            if (generation === this.personaOpenGeneration) this.personaSelectorOpening = false;
            throw err;
        }
        if (!this.container || generation !== this.personaOpenGeneration) return;

        const userAvatars = this.cachedUserAvatars;
        this.personaSelectorOpening = false;
        this.personaSelectorOpen = true;

        const personaMenu = $('<div id="lpPersonaMenu"><ul class="list-group" role="menu" aria-label="Choose persona"></ul></div>');

        for (const userAvatar of userAvatars) {
            const personaName = power_user.personas[userAvatar] || userAvatar;
            const personaTitle = power_user.persona_descriptions?.[userAvatar]?.title || '';
            const imgTitle = personaTitle ? `${personaName} - ${personaTitle}` : personaName;
            const imgUrl = getUserAvatar(userAvatar);
            const isSelected = userAvatar === user_avatar;
            const listItem = $('<li class="list-group-item"></li>');
            const option = $('<button type="button" class="lp-persona-option" role="menuitem"><img class="lpPersonaMenuImg"/></button>');
            option.attr('aria-label', imgTitle);
            option.find('img')
                .attr('src', imgUrl)
                .attr('title', imgTitle)
                .toggleClass('selected', isSelected);
            option.on('click', async () => {
                this.closePersonaSelector();
                await this.selectPersona(userAvatar);
            });
            listItem.append(option);
            personaMenu.find('ul').append(listItem);
        }

        personaMenu.hide();
        $('#lpPersonaMenu').stop(true, true).remove();
        $(document.body).append(personaMenu);

        const caret = this.container.querySelector('.lp-user-caret');
        this.container.querySelector('.lp-user-profile')?.setAttribute('aria-expanded', 'true');
        if (caret) {
            caret.classList.remove('fa-caret-down');
            caret.classList.add('fa-caret-up');
        }

        personaMenu.fadeIn(150);

        this.personaPopper = Popper.createPopper(
            this.container.querySelector('.lp-user-profile'),
            document.getElementById('lpPersonaMenu'),
            { placement: 'bottom-start' },
        );
        this.personaPopper.update();
    }

    closePersonaSelector() {
        this.personaOpenGeneration++;
        this.personaSelectorOpening = false;
        this.personaSelectorOpen = false;
        const caret = this.container?.querySelector('.lp-user-caret');
        this.container?.querySelector('.lp-user-profile')?.setAttribute('aria-expanded', 'false');
        if (caret) {
            caret.classList.remove('fa-caret-up');
            caret.classList.add('fa-caret-down');
        }

        $('#lpPersonaMenu').stop(true, true).fadeOut(150, function () { $(this).remove(); });

        if (this.personaPopper) {
            this.personaPopper.destroy();
            this.personaPopper = null;
        }
    }

    async selectPersona(avatarId) {
        try {
            await setUserAvatar(avatarId);
            this.updateUserProfile();
            await this.loadCharacters();
        } catch (err) {
            console.error('[LPR] Failed to set user avatar:', err);
            if (typeof toastr !== 'undefined') toastr.error('Failed to change persona', 'Landing Page');
        }
    }

    updateUserProfile() {
        const userProfile = this.container?.querySelector('.lp-user-profile');
        if (!userProfile) return;

        const personaName = power_user.personas[user_avatar] || user_avatar;
        const personaTitle = power_user.persona_descriptions?.[user_avatar]?.title || '';
        const imgTitle = personaTitle ? `${personaName} - ${personaTitle}` : personaName;
        const imgUrl = getUserAvatar(user_avatar);

        userProfile.innerHTML = `
            <div class="lp-user-avatar">
                <img src="${imgUrl}" alt="${esc(personaName)}" title="${esc(imgTitle)}">
            </div>
            <span class="lp-user-name">${esc(personaName)}</span>
            <div class="lp-user-caret fa-fw fa-solid fa-caret-down"></div>
        `;
    }
};
