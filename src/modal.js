/**
 * modal.js — Landing Page Redux control panel.
 *
 * Pattern lifted from SimpleSummarizer's modal: persistent DOM via
 * ensureModalDOM(), a 56px icon rail, tab dispatch, ESC + overlay-click
 * close, and immediate-save settings (no Save button).
 *
 * Prefix is `lpm-` (landing-page-modal), NOT `lp-`, to avoid colliding with
 * the landing page's own classes (.lp-sidebar, .lp-content, etc).
 *
 * The six tabs update settings immediately without a separate Save action.
 */
import { renderGeneralTab, renderDisplayTab } from './modalGeneralTab.js';
import { renderTagsTab } from './modalTagsTab.js';
import { renderWallpapersTab, resetWallpaperTab } from './modalWallpapersTab.js';
import { renderButtonsTab } from './modalButtonsTab.js';
import { renderThemeTab } from './modalThemeTab.js';

let isOpen = false;
let activeTab = 'general';
let escHandler = null;
let previousFocus = null;
let inertBackground = [];

const MODAL_ID = 'lpm-modal';
const OVERLAY_ID = 'lpm-overlay';

const TABS = [
    { id: 'general',    icon: 'fa-gears',   label: 'General' },
    { id: 'display',    icon: 'fa-display', label: 'Display' },
    { id: 'tags',       icon: 'fa-tags',    label: 'Tags' },
    { id: 'wallpapers', icon: 'fa-image',   label: 'Wallpapers' },
    { id: 'buttons',    icon: 'fa-link',    label: 'Buttons' },
    { id: 'theme',      icon: 'fa-palette', label: 'Theme' },
];

// ============================================================
// Open / Close
// ============================================================

export function openLandingModal(tab = null) {
    if (tab && TABS.some(t => t.id === tab)) activeTab = tab;

    if (isOpen) {
        renderContent(); // already open — just switch tab
        return;
    }

    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    isOpen = true;
    ensureModalDOM();
    renderContent();
    setBackgroundInert();

    requestAnimationFrame(() => {
        document.getElementById(OVERLAY_ID)?.classList.add('lpm-visible');
        document.getElementById(MODAL_ID)?.classList.add('lpm-visible');
        document.querySelector(`#lpm-tab-${activeTab}`)?.focus();
    });
}

export function closeLandingModal() {
    if (!isOpen) return;
    document.getElementById(OVERLAY_ID)?.classList.remove('lpm-visible');
    document.getElementById(MODAL_ID)?.classList.remove('lpm-visible');
    isOpen = false;
    resetWallpaperTab();
    restoreBackgroundInert();
    const focusTarget = previousFocus;
    previousFocus = null;
    if (focusTarget?.isConnected) focusTarget.focus();
}

export function destroyLandingModal() {
    closeLandingModal();
    restoreBackgroundInert();
    if (escHandler) {
        document.removeEventListener('keydown', escHandler);
        escHandler = null;
    }
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(MODAL_ID)?.remove();
    isOpen = false;
    resetWallpaperTab();
    previousFocus = null;
}

// ============================================================
// DOM creation (once)
// ============================================================

function ensureModalDOM() {
    if (document.getElementById(MODAL_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'lpm-overlay';
    overlay.addEventListener('click', closeLandingModal);
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'lpm-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'lpm-title');
    modal.tabIndex = -1;
    modal.innerHTML = `
        <div class="lpm-header">
            <div class="lpm-title" id="lpm-title"><i class="fa-solid fa-house"></i> Landing Page Redux</div>
            <button type="button" class="lpm-close" id="lpm-close" aria-label="Close control panel">&times;</button>
        </div>
        <div class="lpm-body">
            <div class="lpm-rail" id="lpm-rail" role="tablist" aria-label="Control panel sections"></div>
            <div class="lpm-content" id="lpm-content" role="tabpanel" tabindex="0"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#lpm-close')?.addEventListener('click', closeLandingModal);

    escHandler = (e) => {
        if (!isOpen) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeLandingModal();
        } else if (e.key === 'Tab') {
            trapModalFocus(e);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function getFocusableElements(container) {
    return [...container.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter(el => !el.hidden && el.getAttribute('aria-hidden') !== 'true');
}

function trapModalFocus(event) {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const focusable = getFocusableElements(modal);
    if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
}

function setBackgroundInert() {
    restoreBackgroundInert();
    inertBackground = [...document.body.children]
        .filter(el => el.id !== MODAL_ID && el.id !== OVERLAY_ID)
        .map(element => ({
            element,
            inert: element.inert,
            ariaHidden: element.getAttribute('aria-hidden'),
        }));

    for (const { element } of inertBackground) {
        element.inert = true;
        element.setAttribute('aria-hidden', 'true');
    }
}

function restoreBackgroundInert() {
    for (const { element, inert, ariaHidden } of inertBackground) {
        if (!element.isConnected) continue;
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
    }
    inertBackground = [];
}

// ============================================================
// Rail (icon nav) + content dispatch
// ============================================================

function renderRail() {
    const rail = document.getElementById('lpm-rail');
    if (!rail) return;

    rail.innerHTML = TABS.map(t => `
        <button type="button" id="lpm-tab-${t.id}" class="lpm-nav-item ${t.id === activeTab ? 'lpm-nav-active' : ''}" data-tab="${t.id}" title="${t.label}" role="tab" aria-selected="${t.id === activeTab}" aria-controls="lpm-content" aria-label="${t.label}">
            <i class="fa-solid ${t.icon}"></i>
        </button>
    `).join('');

    const tabs = [...rail.querySelectorAll('.lpm-nav-item')];
    tabs.forEach((el, index) => {
        const activate = () => {
            if (el.dataset.tab !== activeTab) resetWallpaperTab();
            activeTab = el.dataset.tab;
            renderContent();
            document.querySelector(`#lpm-tab-${activeTab}`)?.focus();
        };

        el.addEventListener('click', activate);
        el.addEventListener('keydown', (event) => {
            let nextIndex = null;
            if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = tabs.length - 1;
            else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
            if (nextIndex === null) return;
            event.preventDefault();
            tabs[nextIndex].click();
        });
    });
}

function renderContent() {
    renderRail();
    const content = document.getElementById('lpm-content');
    if (!content) return;
    content.setAttribute('aria-labelledby', `lpm-tab-${activeTab}`);

    switch (activeTab) {
        case 'general':    renderGeneralTab(content); break;
        case 'display':    renderDisplayTab(content); break;
        case 'tags':       renderTagsTab(content); break;
        case 'wallpapers': renderWallpapersTab(content); break;
        case 'buttons':    renderButtonsTab(content); break;
        case 'theme':      renderThemeTab(content); break;
        default:           renderGeneralTab(content);
    }
}
