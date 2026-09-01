/**
 * Landing surface layout, background, view, and sidebar command behavior.
 */
import { eventSource, event_types } from '../../../../../script.js';
import { getSettings, setDefaultView } from '../index.js';
import { runSlashCommand } from './utils.js';
import { openLandingModal } from './modal.js';
import { showNewChatModal } from './newChatModal.js';
import { resolveActiveTagFilter } from './tagFilter.js';
import { getActiveWallpaper } from './wallpapers.js';

export class LandingSurfaceMethods {
    // ---- Wallpaper ----

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

    // ---- View mode toggle ----

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
        setDefaultView(this.currentView, { apply: false });
        this.currentPage = 0;
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
        btn.setAttribute('aria-label', btn.title);
    }

    // ---- New chat ----

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

    // ---- Custom button menu ----

    /**
     * Render user-defined slash-command shortcut buttons into the given panel.
     * Reads settings.menuItems: [{ label, icon?, command }]. Items missing a
     * label or command are skipped. Safe to call repeatedly (clears first), so
     * the modal's Buttons tab can refresh live after edits.
     */
    renderMenu(menuPanel) {
        if (!menuPanel) return;
        menuPanel.innerHTML = '';

        const settings = getSettings();
        const items = settings.menuItems || [];

        for (const item of items) {
            if (!item || !item.label || !item.command) continue;

            const btn = document.createElement('button');
            btn.type = 'button';
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

        // Two stacked background layers crossfade between wallpapers.
        // refreshBackground() swaps the active layer; the opacity
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

        // Sidebar
        const sidebar = document.createElement('div');
        sidebar.className = 'lp-sidebar';

        // User profile opens the persona selector.
        const userProfile = document.createElement('button');
        userProfile.type = 'button';
        userProfile.className = 'lp-user-profile';
        userProfile.setAttribute('aria-haspopup', 'menu');
        userProfile.setAttribute('aria-expanded', 'false');
        userProfile.addEventListener('click', () => this.togglePersonaSelector());
        sidebar.appendChild(userProfile);

        // Tag picker and custom commands fill the middle of the sidebar.
        const sidebarRest = document.createElement('div');
        sidebarRest.className = 'lp-sidebar-rest';

        // Tag filter picker sits above the custom button menu.
        // Initialize the active filter from the remembered/default setting,
        // validated against what's currently exposed.
        this.currentTagFilter = resolveActiveTagFilter(getSettings().defaultTagFilter);
        const tagPickerHost = document.createElement('div');
        tagPickerHost.className = 'lp-tag-picker-host';
        this.renderTagPicker(tagPickerHost);
        sidebarRest.appendChild(tagPickerHost);

        // User-defined slash-command shortcuts.
        const menuPanel = document.createElement('div');
        menuPanel.className = 'lp-menu-panel';
        this.renderMenu(menuPanel);
        sidebarRest.appendChild(menuPanel);

        sidebar.appendChild(sidebarRest);

        // Action area — pinned to the bottom of the sidebar: New chat (opens
        // the character/persona picker) + cog (opens the control panel modal).
        const actionArea = document.createElement('div');
        actionArea.className = 'lp-action-area';

        const newChat = document.createElement('button');
        newChat.type = 'button';
        newChat.className = 'lp-new-chat';
        newChat.title = 'Start a new chat';
        newChat.innerHTML = '<i class="fa-solid fa-plus"></i><span>New chat</span>';
        newChat.addEventListener('click', () => this.openNewChat());
        actionArea.appendChild(newChat);

        const cog = document.createElement('button');
        cog.type = 'button';
        cog.className = 'lp-settings-cog';
        cog.title = 'Control Panel';
        cog.setAttribute('aria-label', 'Open control panel');
        cog.innerHTML = '<i class="fa-solid fa-gear"></i>';
        cog.addEventListener('click', () => openLandingModal());
        actionArea.appendChild(cog);
        sidebar.appendChild(actionArea);

        this.container.appendChild(sidebar);

        // Character cards area.
        const cardsArea = document.createElement('div');
        cardsArea.className = 'lp-cards-area';
        this.container.appendChild(cardsArea);

        // Top icon bar (view-mode toggle)
        const topIconBar = document.createElement('div');
        topIconBar.className = 'lp-top-icon-bar';

        // View mode toggle (sprite ↔ card) — resolve from tag override first
        this.currentView = this.resolveViewForTag(this.currentTagFilter);
        const viewToggle = document.createElement('button');
        viewToggle.type = 'button';
        viewToggle.className = 'lp-view-toggle';
        viewToggle.title = this.currentView === 'sprite' ? 'Switch to card grid' : 'Switch to sprite view';
        viewToggle.setAttribute('aria-label', viewToggle.title);
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

        // Resize only the current sprite layout; character/image data stays intact.
        this.resizeHandler = () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.updateSpriteSizing();
            }, 120);
        };
        window.addEventListener('resize', this.resizeHandler);

        await this.loadCharacters();
        this.isFirstRender = false;
    }
}
