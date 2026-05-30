/**
 * LandingPage — main container class.
 *
 * Owns DOM construction, sidebar, view dispatch, render lifecycle.
 * Step 1 scaffold: renders an empty themed container, no characters yet.
 */
import { characters, eventSource, event_types, saveSettingsDebounced } from '../../../../../script.js';
import { getUserAvatar, getUserAvatars, setUserAvatar, user_avatar } from '../../../../personas.js';
import { power_user } from '../../../../power-user.js';
import { Popper } from '../../../../../lib.js';
import { getSettings, setNavigating } from '../index.js';
import { findExpressions, getCachedExpressionUrl } from './expressions.js';
import { navigateToChat, runSlashCommand } from './utils.js';
import { openLandingModal } from './modal.js';
import { showNewChatModal } from './newChatModal.js';
import { getFilteredCharacters, getExposedTags, getTagDisplayName, resolveActiveTagFilter } from './tagFilter.js';
import { getActiveWallpaper } from './wallpapers.js';

const DEBUG = false;
function log(...args) {
    if (DEBUG) console.log('[LPR]', ...args);
}

export class LandingPage {
    constructor() {
        this.container = null;
        this.isLoading = false;
        this.isFirstRender = true;
        this.currentPage = 0;
        this.isAnimating = false;
        this.personaSelectorOpen = false;
        this.personaPopper = null;
        this.currentTagFilter = null;    // active tag filter (null = "All Recent")
        this.tagSelectorOpen = false;
        this.tagPopper = null;
        this.currentView = null;         // 'sprite' | 'card' — set in render()
        this.cachedUserAvatars = null;   // persona list cache (per landing-page visit)
        this.onSettingsUpdated = null;   // SETTINGS_UPDATED handler, invalidates the cache
        this.loadingImages = [];
        this.resizeHandler = null;
        this.lastWindowWidth = 0;
        this.lastCardCount = 0;
        this.cachedCardSizes = null;
        this.renderGeneration = 0;    // bumped each loadCharacters(); stale upgrades bail
        this.activeBg = 0;            // index (0|1) of the visible background layer
        this.currentBgImage = null;  // last applied wallpaper (skips redundant crossfades)
    }

    async show() {
        if (this.container) {
            this.container.style.display = 'flex';
            void this.container.offsetHeight; // force reflow for :has() selector
            await this.loadCharacters();
            return;
        }
        await this.render();
    }

    /**
     * Lift the Nebula Loader handoff cloak, if present. Called the instant the
     * landing page is painted (when .lp-loaded goes on), so the loader-screen
     * cloak fades directly into the landing page with no flash of bare ST UI
     * in between. No-op when nebula-loader isn't installed — the global hook
     * simply won't exist. Safe to call more than once (the hook is idempotent).
     */
    liftNebulaCloak() {
        try {
            console.log('[LPR] .lp-loaded set; calling __nebulaLiftCloak (exists=' + (typeof window.__nebulaLiftCloak === 'function') + ')');
            window.__nebulaLiftCloak?.();
        } catch (e) { console.log('[LPR] liftNebulaCloak error', e); }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    async cleanup() {
        // Abort any in-flight image loads
        this.loadingImages.forEach(img => { img.src = ''; });
        this.loadingImages = [];

        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }

        $(document.body).off('click.lpDropdowns');

        if (this.onSettingsUpdated) {
            eventSource.removeListener(event_types.SETTINGS_UPDATED, this.onSettingsUpdated);
            this.onSettingsUpdated = null;
        }
        this.cachedUserAvatars = null;

        if (this.personaPopper) {
            this.personaPopper.destroy();
            this.personaPopper = null;
        }
        $('#lpPersonaMenu').remove();
        this.personaSelectorOpen = false;

        if (this.tagPopper) {
            this.tagPopper.destroy();
            this.tagPopper = null;
        }
        $('#lpTagMenu').remove();
        this.tagSelectorOpen = false;

        if (this.container) {
            this.container.remove();
            this.container = null;
        }

        this.isLoading = false;
        this.isFirstRender = true;
        this.isAnimating = false;

        log('Cleanup complete');
    }

    // ---- Persona selector (step 5) ----

    async togglePersonaSelector() {
        if (this.personaSelectorOpen) {
            this.closePersonaSelector();
            return;
        }
        await this.openPersonaSelector();
    }

    async openPersonaSelector() {
        this.personaSelectorOpen = true;

        // Cached per visit; SETTINGS_UPDATED clears it so new personas still appear
        if (!this.cachedUserAvatars) {
            this.cachedUserAvatars = await getUserAvatars(false);
        }
        const userAvatars = this.cachedUserAvatars;

        const personaMenu = $('<div id="lpPersonaMenu"><ul class="list-group"></ul></div>');

        for (const userAvatar of userAvatars) {
            const personaName = power_user.personas[userAvatar] || userAvatar;
            const personaTitle = power_user.persona_descriptions?.[userAvatar]?.title || '';
            const imgTitle = personaTitle ? `${personaName} - ${personaTitle}` : personaName;
            const imgUrl = getUserAvatar(userAvatar);
            const isSelected = userAvatar === user_avatar;
            const listItem = $('<li tabindex="0" class="list-group-item interactable"><img class="lpPersonaMenuImg"/></li>');
            listItem.find('img')
                .attr('src', imgUrl)
                .attr('title', imgTitle)
                .toggleClass('selected', isSelected);
            listItem.on('click', async () => {
                this.closePersonaSelector();
                await this.selectPersona(userAvatar);
            });
            personaMenu.find('ul').append(listItem);
        }

        personaMenu.hide();
        $(document.body).append(personaMenu);

        const caret = this.container.querySelector('.lp-user-caret');
        if (caret) {
            caret.classList.toggle('fa-caret-down');
            caret.classList.toggle('fa-caret-up');
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
        this.personaSelectorOpen = false;
        const caret = this.container?.querySelector('.lp-user-caret');
        if (caret) {
            caret.classList.toggle('fa-caret-down');
            caret.classList.toggle('fa-caret-up');
        }

        $('#lpPersonaMenu').fadeOut(150, () => $('#lpPersonaMenu').remove());

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
                <img src="${imgUrl}" alt="${personaName}" title="${imgTitle}">
            </div>
            <span class="lp-user-name">${personaName}</span>
            <div class="lp-user-caret fa-fw fa-solid fa-caret-down"></div>
        `;
    }

    // ---- Tag filter picker (step 9) ----

    /**
     * Render the sidebar tag-filter control into its host element. Shows the
     * current filter plus a caret; clicking opens the tag menu. If no tags are
     * exposed, the picker is hidden entirely (nothing to pick).
     */
    renderTagPicker(host) {
        if (!host) return;
        host.innerHTML = '';

        const exposed = getExposedTags();
        if (exposed.length === 0) return; // no exposable tags → no picker

        const picker = document.createElement('div');
        picker.className = 'lp-tag-picker';
        picker.innerHTML = `
            <i class="fa-solid fa-tags lp-tag-picker-icon"></i>
            <span class="lp-tag-picker-label"></span>
            <i class="fa-solid fa-caret-down lp-tag-caret"></i>
        `;
        picker.querySelector('.lp-tag-picker-label').textContent =
            getTagDisplayName(this.currentTagFilter);
        picker.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTagSelector();
        });
        host.appendChild(picker);
    }

    toggleTagSelector() {
        if (this.tagSelectorOpen) {
            this.closeTagSelector();
            return;
        }
        this.openTagSelector();
    }

    openTagSelector() {
        const picker = this.container?.querySelector('.lp-tag-picker');
        if (!picker) return;
        this.tagSelectorOpen = true;

        const menu = $('<div id="lpTagMenu"><ul class="lp-tag-menu-list"></ul></div>');
        const list = menu.find('ul');

        // "All Recent" first, then each exposed tag (in exposed order)
        const options = [
            { id: null, name: 'All Recent', color: '' },
            ...getExposedTags().map(t => ({ id: t.id, name: getTagDisplayName(t.id), color: t.color })),
        ];

        for (const opt of options) {
            const selected = (opt.id || null) === (this.currentTagFilter || null);
            const item = $('<li tabindex="0" class="lp-tag-menu-item"></li>');
            item.toggleClass('selected', selected);
            const dot = opt.color
                ? `<span class="lp-tag-dot" style="background:${opt.color}"></span>`
                : '<span class="lp-tag-dot lp-tag-dot-empty"></span>';
            item.html(`${dot}<span class="lp-tag-menu-name"></span><i class="fa-solid fa-check lp-tag-check"></i>`);
            item.find('.lp-tag-menu-name').text(opt.name);
            item.on('click', () => {
                this.closeTagSelector();
                this.selectTagFilter(opt.id || null);
            });
            list.append(item);
        }

        menu.hide();
        $(document.body).append(menu);

        const caret = picker.querySelector('.lp-tag-caret');
        caret?.classList.replace('fa-caret-down', 'fa-caret-up');

        menu.fadeIn(150);
        this.tagPopper = Popper.createPopper(picker, document.getElementById('lpTagMenu'), {
            placement: 'bottom-start',
        });
        this.tagPopper.update();
    }

    closeTagSelector() {
        this.tagSelectorOpen = false;
        const caret = this.container?.querySelector('.lp-tag-caret');
        caret?.classList.replace('fa-caret-up', 'fa-caret-down');

        $('#lpTagMenu').fadeOut(150, () => $('#lpTagMenu').remove());
        if (this.tagPopper) {
            this.tagPopper.destroy();
            this.tagPopper = null;
        }
    }

    /**
     * Apply a tag filter: persist it as the remembered selection, reset to the
     * first page, update the picker label, and reload the character grid.
     * The selection doubles as the next-load default (single settings key).
     * @param {string|null} tagId
     */
    selectTagFilter(tagId) {
        this.currentTagFilter = tagId || null;
        getSettings().defaultTagFilter = this.currentTagFilter;
        saveSettingsDebounced();
        this.currentPage = 0;
        this.updateTagPickerLabel();

        // Switch view mode if this tag has a per-tag override
        const resolvedView = this.resolveViewForTag(this.currentTagFilter);
        if (resolvedView !== this.currentView) {
            this.currentView = resolvedView;
            this.cachedCardSizes = null;
            this.updateViewToggle();
        }

        this.loadCharacters();
    }

    updateTagPickerLabel() {
        const label = this.container?.querySelector('.lp-tag-picker-label');
        if (label) label.textContent = getTagDisplayName(this.currentTagFilter);
    }

    /**
     * Re-render the picker after exposed-tags / display-name edits in the modal.
     * Re-resolves the active filter in case the selected tag was un-exposed or
     * deleted, reloading the grid if the effective filter changed.
     */
    refreshTagPicker() {
        const host = this.container?.querySelector('.lp-tag-picker-host');
        if (!host) return;
        const resolved = resolveActiveTagFilter(this.currentTagFilter);
        const changed = resolved !== this.currentTagFilter;
        this.currentTagFilter = resolved;
        this.renderTagPicker(host);
        if (changed) {
            this.currentPage = 0;
            this.loadCharacters();
        }
    }

    // ---- Wallpaper (step 10) ----

    /**
     * Re-resolve the wallpaper for the current tag filter (per-tag → global →
     * none) and crossfade to it. The incoming layer gets the new image and
     * fades in while the previous layer fades out. Skips work when the resolved
     * image is unchanged, so tag switches that share a wallpaper don't flicker.
     */
    refreshBackground() {
        const layers = this.container?.querySelectorAll('.lp-bg-layer');
        if (!layers || layers.length < 2) return;

        const next = getActiveWallpaper(this.currentTagFilter); // 'url("…")' or ''
        if (next === this.currentBgImage) return;
        this.currentBgImage = next;

        const incoming = layers[this.activeBg ^ 1];
        const outgoing = layers[this.activeBg];

        incoming.style.backgroundImage = next;
        incoming.classList.add('lp-bg-layer-active');
        outgoing.classList.remove('lp-bg-layer-active');
        this.activeBg ^= 1;
    }

    // ---- View mode toggle (step 11) ----

    /**
     * Resolve which view mode to use for a given tag filter.
     * Per-tag overrides take priority; falls back to the global default.
     * @param {string|null} tagId
     * @returns {'sprite'|'card'}
     */
    resolveViewForTag(tagId) {
        const settings = getSettings();
        if (tagId && settings.tagViewModes?.[tagId]) {
            return settings.tagViewModes[tagId];
        }
        return settings.defaultView || 'sprite';
    }

    toggleView() {
        this.currentView = this.currentView === 'sprite' ? 'card' : 'sprite';
        getSettings().defaultView = this.currentView;
        saveSettingsDebounced();
        this.currentPage = 0;
        this.cachedCardSizes = null;
        this.updateViewToggle();
        this.loadCharacters();
    }

    updateViewToggle() {
        const btn = this.container?.querySelector('.lp-view-toggle');
        if (!btn) return;
        if (this.currentView === 'sprite') {
            btn.innerHTML = '<i class="fa-solid fa-grip"></i>';
            btn.title = 'Switch to card grid';
        } else {
            btn.innerHTML = '<i class="fa-solid fa-images"></i>';
            btn.title = 'Switch to sprite view';
        }
    }

    // ---- New chat (step 12) ----

    /**
     * Open the character/persona picker. Selecting a character starts a fresh
     * chat with them (see newChatModal.js), which fires CHAT_CHANGED and tears
     * the landing page down on its own.
     */
    async openNewChat() {
        try {
            await showNewChatModal();
        } catch (err) {
            console.error('[LPR] New chat modal failed:', err);
        }
    }

    // ---- Custom button menu (step 6) ----

    /**
     * Render user-defined slash-command shortcut buttons into the given panel.
     * Reads settings.menuItems: [{ label, icon?, command }]. Items missing a
     * label or command are skipped. Safe to call repeatedly (clears first), so
     * the modal's Buttons tab (step 7) can refresh live after edits.
     */
    renderMenu(menuPanel) {
        if (!menuPanel) return;
        menuPanel.innerHTML = '';

        const settings = getSettings();
        const items = settings.menuItems || [];

        for (const item of items) {
            if (!item || !item.label || !item.command) continue;

            const btn = document.createElement('div');
            btn.className = 'lp-menu-item';

            if (item.icon && item.icon.trim()) {
                const icon = document.createElement('i');
                icon.className = item.icon.trim();
                btn.appendChild(icon);
            }

            const label = document.createElement('span');
            label.textContent = item.label;
            btn.appendChild(label);

            // Long labels get a tooltip so the truncated text is still readable
            if (item.label.length > 20) btn.title = item.label;

            btn.addEventListener('click', () => runSlashCommand(item.command));
            menuPanel.appendChild(btn);
        }
    }

    /**
     * Re-render the custom button menu in place (used after settings change).
     */
    refreshMenu() {
        const menuPanel = this.container?.querySelector('.lp-menu-panel');
        if (menuPanel) this.renderMenu(menuPanel);
    }

    async render() {
        // Root container
        this.container = document.createElement('div');
        this.container.className = 'lp-container';
        this.container.style.display = 'flex';

        // Background: two stacked layers that crossfade between wallpapers
        // (step 12). refreshBackground() swaps the active layer; the opacity
        // transition does the fade (background-image itself can't animate).
        const bgWrap = document.createElement('div');
        bgWrap.className = 'lp-background-wrap';
        const bgA = document.createElement('div');
        bgA.className = 'lp-bg-layer';
        const bgB = document.createElement('div');
        bgB.className = 'lp-bg-layer';
        bgWrap.appendChild(bgA);
        bgWrap.appendChild(bgB);
        this.container.appendChild(bgWrap);

        const overlay = document.createElement('div');
        overlay.className = 'lp-background-overlay';
        this.container.appendChild(overlay);

        // Sidebar (user profile now; tag picker, buttons, actions land in later steps)
        const sidebar = document.createElement('div');
        sidebar.className = 'lp-sidebar';

        // User profile — click opens the persona selector (step 5)
        const userProfile = document.createElement('div');
        userProfile.className = 'lp-user-profile';
        userProfile.addEventListener('click', () => this.togglePersonaSelector());
        sidebar.appendChild(userProfile);

        // Rest of the sidebar. Tag picker (step 9) will be inserted above the
        // menu panel; the action area (cog + new chat) lands in step 7.
        const sidebarRest = document.createElement('div');
        sidebarRest.className = 'lp-sidebar-rest';

        // Tag filter picker (step 9) — sits above the custom button menu.
        // Initialize the active filter from the remembered/default setting,
        // validated against what's currently exposed.
        this.currentTagFilter = resolveActiveTagFilter(getSettings().defaultTagFilter);
        const tagPickerHost = document.createElement('div');
        tagPickerHost.className = 'lp-tag-picker-host';
        this.renderTagPicker(tagPickerHost);
        sidebarRest.appendChild(tagPickerHost);

        // Custom button menu (step 6) — user-defined slash-command shortcuts
        const menuPanel = document.createElement('div');
        menuPanel.className = 'lp-menu-panel';
        this.renderMenu(menuPanel);
        sidebarRest.appendChild(menuPanel);

        sidebar.appendChild(sidebarRest);

        // Action area — pinned to the bottom of the sidebar: New chat (opens
        // the character/persona picker) + cog (opens the control panel modal).
        const actionArea = document.createElement('div');
        actionArea.className = 'lp-action-area';

        const newChat = document.createElement('div');
        newChat.className = 'lp-new-chat';
        newChat.title = 'Start a new chat';
        newChat.innerHTML = '<i class="fa-solid fa-plus"></i><span>New chat</span>';
        newChat.addEventListener('click', () => this.openNewChat());
        actionArea.appendChild(newChat);

        const cog = document.createElement('div');
        cog.className = 'lp-settings-cog';
        cog.title = 'Control Panel';
        cog.innerHTML = '<i class="fa-solid fa-gear"></i>';
        cog.addEventListener('click', () => openLandingModal());
        actionArea.appendChild(cog);
        sidebar.appendChild(actionArea);

        this.container.appendChild(sidebar);

        // Cards area (populated in step 3)
        const cardsArea = document.createElement('div');
        cardsArea.className = 'lp-cards-area';
        this.container.appendChild(cardsArea);

        // Top icon bar (view-mode toggle)
        const topIconBar = document.createElement('div');
        topIconBar.className = 'lp-top-icon-bar';

        // View mode toggle (sprite ↔ card) — resolve from tag override first
        this.currentView = this.resolveViewForTag(this.currentTagFilter);
        const viewToggle = document.createElement('button');
        viewToggle.className = 'lp-view-toggle';
        viewToggle.title = this.currentView === 'sprite' ? 'Switch to card grid' : 'Switch to sprite view';
        viewToggle.innerHTML = this.currentView === 'sprite'
            ? '<i class="fa-solid fa-grip"></i>'
            : '<i class="fa-solid fa-images"></i>';
        viewToggle.addEventListener('click', () => this.toggleView());
        topIconBar.appendChild(viewToggle);

        this.container.appendChild(topIconBar);

        // Insert into DOM (must happen before fade-in so CSS :has() can match)
        document.body.appendChild(this.container);
        void this.container.offsetHeight; // force reflow

        // Close the persona / tag menus when clicking outside them
        $(document.body).on('click.lpDropdowns', (e) => {
            if (this.personaSelectorOpen &&
                !e.target.closest('#lpPersonaMenu') &&
                !e.target.closest('.lp-user-profile')) {
                this.closePersonaSelector();
            }
            if (this.tagSelectorOpen &&
                !e.target.closest('#lpTagMenu') &&
                !e.target.closest('.lp-tag-picker')) {
                this.closeTagSelector();
            }
        });

        // Initial persona profile render
        this.updateUserProfile();

        // Invalidate the cached persona list when persona/settings change
        this.onSettingsUpdated = () => { this.cachedUserAvatars = null; };
        eventSource.on(event_types.SETTINGS_UPDATED, this.onSettingsUpdated);

        // Resize listener: invalidate cached card sizes (used in later steps)
        this.resizeHandler = () => {
            this.cachedCardSizes = null;
            this.lastWindowWidth = 0;
        };
        window.addEventListener('resize', this.resizeHandler);

        await this.loadCharacters();
        this.isFirstRender = false;
    }

    async loadCharacters() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.renderGeneration++;

        try {
            const cardsArea = this.container.querySelector('.lp-cards-area');
            const settings = getSettings();
            const isCardView = this.currentView === 'card';

            // Apply view-mode class so CSS can toggle layout
            cardsArea.classList.toggle('lp-view-sprite', !isCardView);
            cardsArea.classList.toggle('lp-view-card', isCardView);

            // Wallpaper: per-tag → global → none (step 10)
            this.refreshBackground();

            if (!characters || characters.length === 0) {
                cardsArea.innerHTML = '<div class="lp-no-characters"><p>Loading characters…</p></div>';
                if (this.isFirstRender) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    this.container.classList.add('lp-loaded');
                    this.liftNebulaCloak(); // page painted — fade the loader cloak into it
                }
                return;
            }

            // Filter by the active tag (step 9), sorted most-recent-first
            let chars = getFilteredCharacters(this.currentTagFilter);
            const numCards = isCardView ? (settings.cardNumCards || 10) : 4;
            const totalChars = chars.length;

            // Empty result: distinguish "no chars at all" from "none tagged X"
            if (totalChars === 0) {
                const msg = this.currentTagFilter
                    ? `No characters tagged "${getTagDisplayName(this.currentTagFilter)}"`
                    : 'No characters found.';
                cardsArea.innerHTML = '<div class="lp-no-characters"><p></p></div>';
                cardsArea.querySelector('p').textContent = msg;
                if (this.isFirstRender) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    this.container.classList.add('lp-loaded');
                    this.liftNebulaCloak(); // page painted — fade the loader cloak into it
                }
                return;
            }

            const totalPages = Math.ceil(totalChars / numCards);
            if (this.currentPage >= totalPages && totalPages > 0) this.currentPage = 0;
            const startIdx = this.currentPage * numCards;
            chars = chars.slice(startIdx, startIdx + numCards);

            // Sprite view: dynamic card sizing from viewport
            if (!isCardView) {
                const { cardHeight, cardWidth } = this.calculateCardSizes(chars.length);
                cardsArea.style.setProperty('--lp-card-height', `${cardHeight}px`);
                cardsArea.style.setProperty('--lp-card-width', `${cardWidth}px`);
            } else {
                cardsArea.style.removeProperty('--lp-card-height');
                cardsArea.style.removeProperty('--lp-card-width');
            }

            // Render cards immediately with card-avatar fallback. We do NOT block
            // the first paint on expression-sprite lookups — those can take a
            // while (HEAD probes across multiple extensions) and would delay the
            // landing page (and the Nebula cloak lift) by seconds.
            //
            // Layout class per card (sprite view only):
            //  • Cache hit (url)  → lp-has-sprite — correct from the start
            //  • Cache hit (null) → lp-has-card   — confirmed no sprite
            //  • Cache miss       → lp-has-sprite — optimistic default; downgraded
            //                        to lp-has-card by upgradeExpressions() if the
            //                        lookup confirms no sprite exists
            // In card view, every card uses lp-has-card (always correct).
            cardsArea.innerHTML = '';
            const fragment = document.createDocumentFragment();
            for (const char of chars) {
                let hasSprite = false;
                if (!isCardView) {
                    const cached = settings.useExpressions
                        ? getCachedExpressionUrl(char.avatar, settings.expression)
                        : null;
                    // undefined = not yet looked up → default to sprite (optimistic)
                    // string   = has sprite URL     → sprite layout
                    // null     = confirmed absent   → card layout
                    hasSprite = cached !== null;
                }
                fragment.appendChild(this.createCharacterCard(char, null, hasSprite));
            }
            cardsArea.appendChild(fragment);

            // Fade-in on first render — happens now, before expression lookup.
            if (this.isFirstRender) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                this.container.classList.add('lp-loaded');
                this.liftNebulaCloak(); // page painted — fade the loader cloak into it
            }

            // Progressive image loading — start with the card avatar for every
            // card (always available, fast). In sprite view, upgradeExpressions()
            // swaps in the real sprite image once the lookup resolves — pure
            // image swap, no layout change.
            for (const char of chars) {
                const imgUrl = `/characters/${char.avatar}`;
                const card = cardsArea.querySelector(`.lp-character-card[data-avatar="${char.avatar}"]`);
                if (!card) continue;
                this.loadCardImage(card, imgUrl, `/characters/${char.avatar}`);
            }

            this.updatePaginationArrows(totalChars, numCards);

            // After paint: resolve expression sprites (sprite view only) and
            // upgrade the cards that have one. Fire-and-forget — never blocks.
            // Generation counter prevents stale results from a previous render
            // from clobbering cards that belong to a newer one.
            if (!isCardView && settings.useExpressions) {
                this.upgradeExpressions(chars, settings.expression, cardsArea, this.renderGeneration);
            }
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Load an image into a card's avatar slot, swapping it in on load. Shared by
     * the initial avatar pass and the later expression-sprite upgrade. On error,
     * falls back to fallbackUrl (the plain card avatar).
     */
    loadCardImage(card, imgUrl, fallbackUrl) {
        const img = new Image();
        this.loadingImages.push(img);
        const cleanup = () => {
            const idx = this.loadingImages.indexOf(img);
            if (idx > -1) this.loadingImages.splice(idx, 1);
        };
        img.onload = () => {
            const el = card.querySelector('.lp-card-avatar img');
            if (el) {
                el.src = imgUrl;
                el.classList.remove('loading');
                el.classList.add('loaded');
            }
            cleanup();
        };
        img.onerror = () => {
            const el = card.querySelector('.lp-card-avatar img');
            if (el && fallbackUrl && el.src !== fallbackUrl) {
                el.src = fallbackUrl;
                el.classList.remove('loading');
                el.classList.add('loaded');
            }
            cleanup();
        };
        img.src = imgUrl;
    }

    /**
     * Resolve expression sprites after the page has already painted, then
     * finalize each card's layout class and image:
     *  • Has sprite → ensure lp-has-sprite, swap in the sprite image
     *  • No sprite  → downgrade to lp-has-card (proper card-avatar styling)
     *
     * On a warm cache the card creation loop already picks the right class,
     * so this is mostly image swaps. On a cold cache (first load), some cards
     * will have been optimistically set to lp-has-sprite and get downgraded
     * here once the lookup confirms no sprite exists.
     *
     * Generation counter guards against stale results from a previous render.
     */
    async upgradeExpressions(chars, expression, cardsArea, generation) {
        try {
            const expressionMap = await findExpressions(chars, expression);
            if (!this.container || this.renderGeneration !== generation) return;
            for (const char of chars) {
                if (this.renderGeneration !== generation) return;
                const card = cardsArea.querySelector(`.lp-character-card[data-avatar="${char.avatar}"]`);
                if (!card) continue;
                const exprUrl = expressionMap.get(char.avatar);
                if (exprUrl) {
                    // Has sprite — ensure sprite layout, swap image
                    card.classList.remove('lp-has-card');
                    card.classList.add('lp-has-sprite');
                    this.loadCardImage(card, exprUrl, `/characters/${char.avatar}`);
                } else {
                    // No sprite — ensure card-avatar layout
                    card.classList.remove('lp-has-sprite');
                    card.classList.add('lp-has-card');
                }
            }
        } catch (err) {
            console.error('[LPR] expression upgrade failed:', err);
        }
    }

    calculateCardSizes(numCards) {
        const currentWidth = window.innerWidth;
        if (this.lastWindowWidth === currentWidth &&
            this.lastCardCount === numCards &&
            this.cachedCardSizes) {
            return this.cachedCardSizes;
        }

        // Read sidebar width from CSS var (no more hard-coded 250)
        const rootStyle = getComputedStyle(document.documentElement);
        const sidebarVar = rootStyle.getPropertyValue('--lp-sidebar-width').trim();
        const sidebarWidth = parseInt(sidebarVar) || 250;

        const availableWidth = currentWidth - sidebarWidth - 100;
        const gapSize = 16;
        const totalGapWidth = (numCards - 1) * gapSize;

        // Base height comes from a CSS var so it's tweakable (live in devtools, or via theme)
        const baseHeightVar = parseInt(rootStyle.getPropertyValue('--lp-card-base-height'));
        const baseHeight = baseHeightVar || 450;
        const idealCardCount = 4;
        const idealCardWidth = (availableWidth - ((idealCardCount - 1) * gapSize)) / idealCardCount;

        const maxCardWidth = (availableWidth - totalGapWidth) / numCards;
        let cardHeight = baseHeight;
        let cardWidth;

        if (numCards <= idealCardCount) {
            cardWidth = Math.min(maxCardWidth, idealCardWidth * 1.2);
        } else {
            cardWidth = maxCardWidth;
            if (cardWidth < idealCardWidth * 0.7) {
                const scale = cardWidth / (idealCardWidth * 0.7);
                cardHeight = baseHeight * scale;
            }
        }

        const sizes = { cardHeight, cardWidth };
        this.lastWindowWidth = currentWidth;
        this.lastCardCount = numCards;
        this.cachedCardSizes = sizes;
        return sizes;
    }

    updatePaginationArrows(totalChars, numCards) {
        const cardsArea = this.container.querySelector('.lp-cards-area');
        if (!cardsArea) return;

        cardsArea.querySelectorAll('.lp-page-arrow').forEach(el => el.remove());

        const totalPages = Math.ceil(totalChars / numCards);
        if (totalPages <= 1) return;

        if (this.currentPage > 0) {
            const leftArrow = document.createElement('button');
            leftArrow.className = 'lp-page-arrow lp-page-arrow-left';
            leftArrow.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
            leftArrow.addEventListener('click', () => {
                this.currentPage--;
                this.loadCharacters();
            });
            cardsArea.appendChild(leftArrow);
        }

        if (this.currentPage < totalPages - 1) {
            const rightArrow = document.createElement('button');
            rightArrow.className = 'lp-page-arrow lp-page-arrow-right';
            rightArrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
            rightArrow.addEventListener('click', () => {
                this.currentPage++;
                this.loadCharacters();
            });
            cardsArea.appendChild(rightArrow);
        }
    }

    createCharacterCard(char, imgUrl, hasExpression = false) {
        const card = document.createElement('div');
        card.className = 'lp-character-card';
        card.classList.add(hasExpression ? 'lp-has-sprite' : 'lp-has-card');
        card.dataset.avatar = char.avatar;

        const settings = getSettings();
        const hideNames = settings.hideNames || false;

        const placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23333" width="100" height="100"/%3E%3C/svg%3E';
        const src = imgUrl || placeholder;
        const cssClass = imgUrl ? 'loaded' : 'loading';
        const nameHTML = hideNames ? '' : `<div class="lp-card-name">${char.name}</div>`;

        card.innerHTML = `
            <div class="lp-card-avatar">
                <img src="${src}" alt="${char.name}" class="${cssClass}">
            </div>
            ${nameHTML}
        `;
        card.addEventListener('click', () => this.handleCardClick(card, char));
        return card;
    }

    async handleCardClick(card, char) {
        if (this.isAnimating) return;
        this.isAnimating = true;

        try {
            const avatarEl = card.querySelector('.lp-card-avatar');
            const startRect = avatarEl.getBoundingClientRect();
            const isCardView = this.currentView === 'card';

            // Clone the card and pin it exactly over the clicked avatar.
            const clone = card.cloneNode(true);
            clone.className = 'lp-character-card lp-card-clone';
            clone.classList.add(card.classList.contains('lp-has-sprite') ? 'lp-has-sprite' : 'lp-has-card');
            clone.style.position = 'fixed';
            clone.style.left = `${startRect.left}px`;
            clone.style.top = `${startRect.top}px`;
            clone.style.width = `${startRect.width}px`;
            clone.style.height = `${startRect.height}px`;
            clone.style.margin = '0';
            clone.style.transform = 'none';
            clone.style.zIndex = '9500'; // above the LP container (9000), below menus (10000)

            const startCenterX = startRect.left + startRect.width / 2;
            const translateX = (window.innerWidth / 2) - startCenterX;

            // The two views want different motion:
            //  • Card view  — fly from the grid slot to screen-center and scale up.
            //  • Sprite view (sprite) — keep the figure grounded: pin the bottom
            //    where it already sits and grow upward (cowboy-shot feel).
            //  • Sprite view (avatar fallback) — centered like card-view, fly + scale.
            let targetTransform;
            const isSpriteImage = card.classList.contains('lp-has-sprite');
            if (!isCardView && isSpriteImage) {
                clone.style.transformOrigin = 'bottom center';
                const scaleFactor = Math.min(1.6, (window.innerHeight * 0.95) / startRect.height);
                targetTransform = `translateX(${translateX}px) scale(${scaleFactor})`;
            } else {
                clone.style.transformOrigin = 'center center';
                const scaleFactor = Math.min(1.5, (window.innerHeight * 0.9) / startRect.height);
                const startCenterY = startRect.top + startRect.height / 2;
                const translateY = (window.innerHeight / 2) - startCenterY;
                targetTransform = `translate(${translateX}px, ${translateY}px) scale(${scaleFactor})`;
            }

            document.body.appendChild(clone);
            await new Promise(resolve => requestAnimationFrame(resolve));

            clone.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
            clone.style.transform = targetTransform;

            await new Promise(resolve => setTimeout(resolve, 500));

            // Mark navigating BEFORE /go so onChatChanged doesn't flash landing back
            setNavigating(true);
            await navigateToChat(char.avatar);

            clone.remove();
        } catch (err) {
            console.error('[LPR] Card click failed:', err);
        } finally {
            this.isAnimating = false;
        }
    }
}
