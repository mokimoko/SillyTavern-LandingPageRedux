/**
 * LandingPage — main container class.
 *
 * Owns landing-page state, lifecycle, and cleanup.
 */
import { eventSource, event_types } from '../../../../../script.js';
import { PersonaMenuMethods } from './personaMenu.js';
import { TagMenuMethods } from './tagMenu.js';
import { CharacterGridMethods } from './characterGrid.js';
import { CardNavigationMethods } from './cardNavigation.js';
import { LandingSurfaceMethods } from './landingSurface.js';

export class LandingPage {
    constructor() {
        this.container = null;
        this.isLoading = false;
        this.refreshPending = false;
        this.isFirstRender = true;
        this.currentPage = 0;
        this.isAnimating = false;
        this.personaSelectorOpen = false;
        this.personaSelectorOpening = false;
        this.personaOpenGeneration = 0;
        this.personaPopper = null;
        this.currentTagFilter = null;    // active tag filter (null = "All Recent")
        this.tagSelectorOpen = false;
        this.tagPopper = null;
        this.currentView = null;         // 'sprite' | 'card' — set in render()
        this.cachedUserAvatars = null;   // persona list cache (per landing-page visit)
        this.onSettingsUpdated = null;   // SETTINGS_UPDATED handler, invalidates the cache
        this.loadingImages = [];
        this.resizeHandler = null;
        this.resizeTimer = null;
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
            window.__nebulaLiftCloak?.();
        } catch { /* */ }
    }

    /**
     * Lift the Nebula cloak once the card images that are already in flight
     * have settled — so the cloak covers the avatar pop-in instead of lifting
     * on the bare (imageless) layout and letting cards populate in view.
     *
     * Only waits on the images loading AT CALL TIME: the initial avatar pass.
     * The later expression-sprite upgrade (upgradeExpressions) is deliberately
     * fire-and-forget and can take seconds — those loaders are NOT awaited, so
     * sprites still swap in underneath the already-revealed page, exactly as
     * before. A per-image timeout guarantees the lift never stalls on a slow or
     * hung avatar (the Nebula hard-stop is the final backstop regardless).
     *
     * @param {number} perImageTimeoutMs max wait per in-flight image
     * @param {number} overallTimeoutMs   absolute cap across all images
     */
    async liftNebulaCloakWhenReady(perImageTimeoutMs = 1200, overallTimeoutMs = 2500) {
        // Snapshot the loaders in flight right now — the avatar pass. Anything
        // added later (sprite upgrades) is intentionally excluded.
        const pending = this.loadingImages.slice();

        if (pending.length === 0) {
            this.liftNebulaCloak();
            return;
        }

        const settle = (img) => new Promise((resolve) => {
            // Already done (complete + has dimensions, or errored to a state
            // where complete is true) — resolve immediately.
            if (img.complete) { resolve(); return; }
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            img.addEventListener('load', finish, { once: true });
            img.addEventListener('error', finish, { once: true });
            // Per-image safety net so one slow avatar can't hold the cloak.
            setTimeout(finish, perImageTimeoutMs);
        });

        const all = Promise.all(pending.map(settle));
        const cap = new Promise((resolve) => setTimeout(resolve, overallTimeoutMs));

        // Whichever comes first: every image settled, or the overall cap.
        await Promise.race([all, cap]);

        // One more frame so the freshly-swapped avatars actually paint under
        // the cloak before it starts fading.
        await new Promise((resolve) => requestAnimationFrame(resolve));
        this.liftNebulaCloak();
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
        if (this.resizeTimer) {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = null;
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
        this.personaSelectorOpening = false;
        this.personaOpenGeneration++;

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
        this.refreshPending = false;
        this.isFirstRender = true;
        this.isAnimating = false;
    }


}
for (const Mixin of [PersonaMenuMethods, TagMenuMethods, LandingSurfaceMethods, CharacterGridMethods, CardNavigationMethods]) {
    const descriptors = Object.getOwnPropertyDescriptors(Mixin.prototype);
    delete descriptors.constructor;
    Object.defineProperties(LandingPage.prototype, descriptors);
}

