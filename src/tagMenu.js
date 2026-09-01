/**
 * Landing-page tag picker, filtering, and targeted sprite rescan behavior.
 */
import { saveSettingsDebounced } from '../../../../../script.js';
import { Popper } from '../../../../../lib.js';
import { getSettings } from '../index.js';
import { forgetNegatives } from './expressions.js';
import { getFilteredCharacters, getExposedTags, getTagDisplayName } from './tagFilter.js';

export class TagMenuMethods {
    // ---- Tag filter picker ----

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

        const picker = document.createElement('button');
        picker.type = 'button';
        picker.className = 'lp-tag-picker';
        picker.setAttribute('aria-haspopup', 'menu');
        picker.setAttribute('aria-expanded', 'false');
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

        const menu = $('<div id="lpTagMenu"><ul class="lp-tag-menu-list" role="menu" aria-label="Filter characters by tag"></ul></div>');
        const list = menu.find('ul');

        // "All Recent" first, then each exposed tag (in exposed order)
        const options = [
            { id: null, name: 'All Recent', color: '' },
            ...getExposedTags().map(t => ({ id: t.id, name: getTagDisplayName(t.id), color: t.color })),
        ];

        for (const opt of options) {
            const selected = (opt.id || null) === (this.currentTagFilter || null);
            const row = $('<li></li>');
            const item = $('<button type="button" role="menuitemradio" class="lp-tag-menu-item"></button>');
            item.toggleClass('selected', selected);
            item.attr('aria-checked', String(selected));
            const dot = opt.color
                ? `<span class="lp-tag-dot" style="background:${opt.color}"></span>`
                : '<span class="lp-tag-dot lp-tag-dot-empty"></span>';
            item.html(`${dot}<span class="lp-tag-menu-name"></span><i class="fa-solid fa-check lp-tag-check"></i>`);
            item.find('.lp-tag-menu-name').text(opt.name);
            item.on('click', () => {
                this.closeTagSelector();
                // Re-selecting the tag that's ALREADY active is a dead action
                // for filtering (same set), so we repurpose it as a deliberate
                // "rescan sprites for this view" gesture — the convenient way to
                // pick up sprite files added since the negatives were cached.
                // Selecting a DIFFERENT tag filters as normal (cache preserved).
                const clicked = opt.id || null;
                if (clicked === (this.currentTagFilter || null)) {
                    this.rescanVisibleSprites();
                } else {
                    this.selectTagFilter(clicked);
                }
            });
            row.append(item);
            list.append(row);
        }

        menu.hide();
        $(document.body).append(menu);

        const caret = picker.querySelector('.lp-tag-caret');
        picker.setAttribute('aria-expanded', 'true');
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
        this.container?.querySelector('.lp-tag-picker')?.setAttribute('aria-expanded', 'false');
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
            this.updateViewToggle();
        }

        this.loadCharacters();
    }

    /**
     * Rescan expression sprites for the characters currently in view — the
     * "re-select the active tag" gesture. Forgets the cached NEGATIVES for just
     * this filtered set (so a character that gained sprite files since the last
     * probe gets re-checked) and reloads, which re-runs the sprite upgrade.
     * Scoped to the visible set on purpose: it won't disturb negatives for
     * characters under other tags, so it's cheap and won't trigger a full-
     * library re-probe. No-op-safe when expressions are disabled.
     */
    rescanVisibleSprites() {
        const settings = getSettings();
        if (!settings.useExpressions) {
            // Nothing to rescan; just reload for consistency (cheap).
            this.loadCharacters();
            return;
        }
        const chars = getFilteredCharacters(this.currentTagFilter);
        const avatars = chars.map(c => c.avatar);
        forgetNegatives(avatars, settings.expression);
        if (typeof toastr !== 'undefined') {
            toastr.info(`Rescanning sprites for ${avatars.length} character${avatars.length === 1 ? '' : 's'}…`, 'Landing Page', { timeOut: 1500 });
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
};
