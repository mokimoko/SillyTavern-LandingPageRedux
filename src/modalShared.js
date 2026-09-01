/**
 * Shared live-refresh operation for control-panel tabs.
 */
import { getLandingPage } from '../index.js';
import { clearExpressionCache } from './expressions.js';

export function refreshLanding({ expressions = false } = {}) {
    const landingPage = getLandingPage();
    if (!landingPage) return;
    if (expressions) clearExpressionCache();
    landingPage.loadCharacters?.();
}
