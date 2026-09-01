# Landing Page Redux

A [SillyTavern](https://github.com/SillyTavern/SillyTavern) extension that replaces the default landing page with an immersive character picker — a remake of the original [Landing Page](https://github.com/LenAnderson/SillyTavern-LandingPage/) by Lenny.

Filter characters by tag, assign wallpapers to each tag group, swap personas directly from the sidebar, and choose between full-body sprites or compact avatar cards (per tag, if you want). You can still wire up custom slash-command buttons too. I built this to my own tastes, but figured others might get some use out of it.

## Installation

Use SillyTavern's built-in extension installer:

1. Open **Extensions** → **Install Extension**
2. Paste this URL:
   ```
   https://github.com/mokimoko/SillyTavern-LandingPageRedux
   ```
3. Click **Install** and reload if prompted

## Compatibility

Extension version: **0.1.0**.

Landing Page Redux targets current SillyTavern and TauriTavern builds with extension lifecycle hooks, native popups, slash commands, personas, tags, and the backgrounds API. The manifest does not currently declare a numeric minimum SillyTavern/TauriTavern version, so compatibility with older builds is best-effort.

## Setup

1. **Open the control panel** — Click the gear icon on the landing page sidebar, or find *Landing Page Redux* in the extensions drawer and click **Open Control Panel**.

2. **Expose tags** — In the **Tags** tab, check the tags you want as sidebar filters. You can rename them (landing-page only) and set a per-tag view mode.

3. **Set wallpapers** — In the **Wallpapers** tab, pick a global background and optionally override it per tag. Uses your existing SillyTavern backgrounds.

4. **Add buttons** *(optional)* — In the **Buttons** tab, create sidebar shortcuts that run any slash command on click.

## Behavior notes

- **Cards per page** is the number of cards loaded in each grid page, not a one-row limit. Extra rows remain reachable by scrolling. Sprite view uses four characters per page and scales them to the available space.
- At **760px and below**, the sidebar stacks above the character area and the control panel switches to a compact layout. At **420px and below**, the card grid becomes one column. Short windows receive additional spacing reductions.
- Wallpaper discovery is cached for the session. Use **Wallpapers → Refresh** after adding or removing SillyTavern backgrounds; a failed discovery request can be retried.
- Sprite hits are cached in memory, while confirmed misses are persisted to avoid repeated 404 probes. Re-select the currently active tag to rescan that visible group after adding sprite files. Changing expression settings also clears the sprite cache.
- The landing page and control panel support keyboard navigation, visible focus rings, dialog focus containment, and reduced-motion preferences.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/landing` | Navigate to the landing page |
| `/landing on` | Enable the landing page |
| `/landing off` | Disable the landing page |

## Credits

- [Landing Page](https://github.com/LenAnderson/SillyTavern-LandingPage/)
- [Quick Persona](https://github.com/SillyTavern/Extension-QuickPersona)
