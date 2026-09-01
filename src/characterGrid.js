/**
 * Character filtering, pagination, image loading, and grid rendering.
 */
import { characters } from '../../../../../script.js';
import { getSettings } from '../index.js';
import { findExpressions, getCachedExpressionUrl } from './expressions.js';
import { esc } from './utils.js';
import { getFilteredCharacters, getTagDisplayName } from './tagFilter.js';
import { getPageWindow } from './runtimeLogic.js';

export class CharacterGridMethods {
    async loadCharacters() {
        if (this.isLoading) {
            this.refreshPending = true;
            return;
        }
        this.isLoading = true;
        this.refreshPending = false;
        this.renderGeneration++;

        try {
            const cardsArea = this.container.querySelector('.lp-cards-area');
            const settings = getSettings();
            const isCardView = this.currentView === 'card';

            // Apply view-mode class so CSS can toggle layout
            cardsArea.classList.toggle('lp-view-sprite', !isCardView);
            cardsArea.classList.toggle('lp-view-card', isCardView);

            // Wallpaper fallback order: per-tag → global → none.
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

            // Filter by the active tag, sorted most-recent-first.
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

            const pageWindow = getPageWindow(totalChars, this.currentPage, numCards);
            if (this.currentPage >= pageWindow.totalPages && pageWindow.totalPages > 0) {
                this.currentPage = 0;
            } else {
                this.currentPage = pageWindow.page;
            }
            const activeWindow = getPageWindow(totalChars, this.currentPage, numCards);
            chars = chars.slice(activeWindow.start, activeWindow.end);

            // Sprite view: dynamic card sizing from viewport
            if (!isCardView) {
                const { cardHeight, cardWidth } = this.calculateCardSizes(chars.length, cardsArea);
                cardsArea.style.setProperty('--lp-card-height', `${cardHeight}px`);
                cardsArea.style.setProperty('--lp-card-width', `${cardWidth}px`);
                cardsArea.style.removeProperty('--lp-card-grid-max');
            } else {
                const scale = (settings.avatarScale ?? 100) / 100;
                const gridMax = Math.round(180 * scale);
                cardsArea.style.setProperty('--lp-card-grid-max', `${gridMax}px`);
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
            if (isCardView) cardsArea.scrollTop = 0;
            const fragment = document.createDocumentFragment();
            const renderedCards = [];
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
                const card = this.createCharacterCard(char, hasSprite);
                renderedCards.push(card);
                fragment.appendChild(card);
            }
            cardsArea.appendChild(fragment);

            // Progressive image loading — load the card avatar for cards that
            // need it. Cards with lp-has-sprite layout are owned by
            // upgradeExpressions(): it will either swap in the real sprite, or
            // downgrade to lp-has-card and load the avatar then. Preloading the
            // avatar here for sprite cards would race with the sprite swap (two
            // in-flight `new Image()` onloads writing to the same el.src — last
            // one wins), causing sprites to flicker back to avatars on return
            // visits when the expression cache is warm and both loads resolve
            // near-simultaneously.
            //
            // NOTE: this runs BEFORE the cloak lift below so the avatar loaders
            // are in flight (tracked in this.loadingImages) when the ready-aware
            // lift snapshots them — letting the cloak cover the avatar pop-in.
            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];
                const card = renderedCards[i];
                if (card.classList.contains('lp-has-sprite')) continue; // owned by upgradeExpressions
                const imgUrl = `/characters/${char.avatar}`;
                this.loadCardImage(card, imgUrl, imgUrl);
            }

            // Fade-in on first render — set the container's own fade class now,
            // then lift the Nebula cloak only once the avatar images queued
            // above have settled (see liftNebulaCloakWhenReady). Sprite upgrades
            // fire later and are intentionally not awaited.
            if (this.isFirstRender) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                this.container.classList.add('lp-loaded');
                this.liftNebulaCloakWhenReady(); // fire-and-forget; waits internally
            }

            this.updatePaginationArrows(totalChars, numCards);

            // After paint: resolve expression sprites (sprite view only) and
            // upgrade the cards that have one. Fire-and-forget — never blocks.
            // Generation counter prevents stale results from a previous render
            // from clobbering cards that belong to a newer one.
            if (!isCardView && settings.useExpressions) {
                this.upgradeExpressions(chars, settings.expression, renderedCards, this.renderGeneration);
            }
        } finally {
            this.isLoading = false;
            if (this.refreshPending && this.container) {
                this.refreshPending = false;
                void this.loadCharacters();
            }
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
    async upgradeExpressions(chars, expression, renderedCards, generation) {
        try {
            const expressionMap = await findExpressions(chars, expression);
            if (!this.container || this.renderGeneration !== generation) return;
            for (let i = 0; i < chars.length; i++) {
                if (this.renderGeneration !== generation) return;
                const char = chars[i];
                const card = renderedCards[i];
                if (!card) continue;
                const exprUrl = expressionMap.get(char.avatar);
                if (exprUrl) {
                    // Has sprite — ensure sprite layout, swap image
                    card.classList.remove('lp-has-card');
                    card.classList.add('lp-has-sprite');
                    this.loadCardImage(card, exprUrl, `/characters/${char.avatar}`);
                } else if (card.classList.contains('lp-has-sprite')) {
                    // Optimistic guess was wrong — no sprite exists. Downgrade
                    // to card layout AND load the avatar (the initial avatar
                    // loop skipped this card because it had lp-has-sprite, so
                    // it's still on the placeholder).
                    card.classList.remove('lp-has-sprite');
                    card.classList.add('lp-has-card');
                    const imgUrl = `/characters/${char.avatar}`;
                    this.loadCardImage(card, imgUrl, imgUrl);
                }
                // else: card was already lp-has-card and the avatar loop already
                // loaded its image. Nothing to do.
            }
        } catch (err) {
            console.error('[LPR] expression upgrade failed:', err);
        }
    }

    updateSpriteSizing() {
        if (!this.container || this.currentView !== 'sprite') return;
        const cardsArea = this.container.querySelector('.lp-cards-area');
        const count = cardsArea?.querySelectorAll('.lp-character-card').length || 0;
        if (!cardsArea || !count) return;
        const { cardHeight, cardWidth } = this.calculateCardSizes(count, cardsArea);
        cardsArea.style.setProperty('--lp-card-height', `${cardHeight}px`);
        cardsArea.style.setProperty('--lp-card-width', `${cardWidth}px`);
    }

    calculateCardSizes(numCards, cardsArea = null) {
        const rootStyle = getComputedStyle(document.documentElement);
        const gapSize = 16;
        const areaWidth = cardsArea?.clientWidth || window.innerWidth;
        const availableWidth = Math.max(0, areaWidth - 64);
        const totalGapWidth = Math.max(0, numCards - 1) * gapSize;
        const widthPerCard = Math.max(90, (availableWidth - totalGapWidth) / numCards);

        const baseHeightVar = parseInt(rootStyle.getPropertyValue('--lp-card-base-height'));
        const scale = (getSettings().avatarScale ?? 100) / 100;
        const baseHeight = baseHeightVar || 450;
        const heightLimit = Math.max(180, window.innerHeight * 0.72);
        const widthHeightLimit = widthPerCard * 2.2;
        const responsiveHeight = Math.max(160, Math.min(baseHeight, heightLimit, widthHeightLimit));

        return {
            // Scale the responsive result so every slider step remains visible;
            // applying scale before the caps made larger values collapse to the
            // same height on constrained windows.
            cardHeight: Math.round(responsiveHeight * scale),
            cardWidth: Math.round(Math.min(320, widthPerCard)),
        };
    }

    updatePaginationArrows(totalChars, numCards) {
        const cardsArea = this.container.querySelector('.lp-cards-area');
        if (!cardsArea) return;

        cardsArea.querySelectorAll('.lp-page-arrow').forEach(el => el.remove());

        const { totalPages } = getPageWindow(totalChars, this.currentPage, numCards);
        if (totalPages <= 1) return;

        if (this.currentPage > 0) {
            const leftArrow = document.createElement('button');
            leftArrow.type = 'button';
            leftArrow.className = 'lp-page-arrow lp-page-arrow-left';
            leftArrow.setAttribute('aria-label', `Previous character page (${this.currentPage} of ${totalPages})`);
            leftArrow.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
            leftArrow.addEventListener('click', () => {
                this.currentPage--;
                this.loadCharacters();
            });
            cardsArea.appendChild(leftArrow);
        }

        if (this.currentPage < totalPages - 1) {
            const rightArrow = document.createElement('button');
            rightArrow.type = 'button';
            rightArrow.className = 'lp-page-arrow lp-page-arrow-right';
            rightArrow.setAttribute('aria-label', `Next character page (${this.currentPage + 2} of ${totalPages})`);
            rightArrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
            rightArrow.addEventListener('click', () => {
                this.currentPage++;
                this.loadCharacters();
            });
            cardsArea.appendChild(rightArrow);
        }
    }

    createCharacterCard(char, hasExpression = false) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'lp-character-card';
        card.setAttribute('aria-label', `Open chat with ${char.name}`);
        card.classList.add(hasExpression ? 'lp-has-sprite' : 'lp-has-card');
        card.dataset.avatar = char.avatar;

        const settings = getSettings();
        const hideNames = settings.hideNames || false;

        const placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23333" width="100" height="100"/%3E%3C/svg%3E';
        const nameHTML = hideNames ? '' : `<div class="lp-card-name">${esc(char.name)}</div>`;

        card.innerHTML = `
            <div class="lp-card-avatar">
                <img src="${placeholder}" alt="${esc(char.name)}" class="loading">
            </div>
            ${nameHTML}
        `;
        card.addEventListener('click', () => this.handleCardClick(card, char));
        return card;
    }
};
