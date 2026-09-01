/**
 * Character-card transition and chat navigation.
 */
import { getSettings, setNavigating } from '../index.js';
import { navigateToChat } from './utils.js';
import { navigateWithState } from './runtimeLogic.js';

export class CardNavigationMethods {
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
            clone.tabIndex = -1;
            clone.setAttribute('aria-hidden', 'true');
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
            // The sprite target height is a fraction of the viewport that scales
            // with avatarScale, so shrinking the sprites shrinks the zoom too.
            let targetTransform;
            const isSpriteImage = card.classList.contains('lp-has-sprite');
            const avatarScale = (getSettings().avatarScale ?? 100) / 100;
            if (!isCardView && isSpriteImage) {
                clone.style.transformOrigin = 'bottom center';
                // Measure the actual rendered sprite image, not the (overflowing)
                // box — for object-fit:contain the img can be taller than its
                // container, and getBoundingClientRect on the box understates it.
                const imgEl = card.querySelector('.lp-card-avatar img');
                const imgRect = imgEl ? imgEl.getBoundingClientRect() : startRect;
                const spriteHeight = imgRect.height || startRect.height;
                // Target on-screen height scales with avatarScale (0.95 of the
                // viewport at 100%, proportionally less when scaled down).
                const targetHeight = window.innerHeight * 0.95 * avatarScale;
                const scaleFactor = Math.min(2.0, targetHeight / spriteHeight);
                targetTransform = `translateX(${translateX}px) scale(${scaleFactor})`;
            } else {
                clone.style.transformOrigin = 'center center';
                const scaleFactor = Math.min(1.5 * avatarScale, (window.innerHeight * 0.9) / startRect.height);
                const startCenterY = startRect.top + startRect.height / 2;
                const translateY = (window.innerHeight / 2) - startCenterY;
                targetTransform = `translate(${translateX}px, ${translateY}px) scale(${scaleFactor})`;
            }

            document.body.appendChild(clone);
            await new Promise(resolve => requestAnimationFrame(resolve));

            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            clone.style.transition = reduceMotion ? 'none' : 'transform 0.5s ease, opacity 0.5s ease';
            clone.style.transform = targetTransform;

            if (!reduceMotion) await new Promise(resolve => setTimeout(resolve, 500));

            // Mark navigating before /go so onChatChanged doesn't flash landing back.
            await navigateWithState(char.avatar, setNavigating, navigateToChat);

            clone.remove();
        } catch (err) {
            console.error('[LPR] Card click failed:', err);
        } finally {
            this.isAnimating = false;
        }
    }
};
