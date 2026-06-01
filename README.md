# Landing Page Redux

A [SillyTavern](https://github.com/SillyTavern/SillyTavern) extension that replaces the default landing page with an immersive character picker — a remake of the original [Landing Page](https://github.com/LenAnderson/SillyTavern-LandingPage/) by Lenny.

Filter characters by tag, assign wallpapers to each tag group, swap personas directly from the sidebar, and choose between full-body sprites or compact avatar cards (per tag, if you want). You can still wire up custom slash-command buttons too. I built this to my own tastes, but figured others might get some use out of it.

## Installation

Use SillyTavern's built-in extension installer:

1. Open **Extensions** → **Install Extension**
2. Paste this URL:
   ```
   https://github.com/nrahis/SillyTavern-LandingPageRedux
   ```
3. Click **Install** and reload if prompted

## Setup

1. **Open the control panel** — Click the gear icon on the landing page sidebar, or find *Landing Page Redux* in the extensions drawer and click **Open Control Panel**.

2. **Expose tags** — In the **Tags** tab, check the tags you want as sidebar filters. You can rename them (landing-page only) and set a per-tag view mode.

3. **Set wallpapers** — In the **Wallpapers** tab, pick a global background and optionally override it per tag. Uses your existing SillyTavern backgrounds.

4. **Add buttons** *(optional)* — In the **Buttons** tab, create sidebar shortcuts that run any slash command on click.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/landing` | Navigate to the landing page |
| `/landing on` | Enable the landing page |
| `/landing off` | Disable the landing page |

## Credits

Inspired by the original [Landing Page](https://github.com/LenAnderson/SillyTavern-LandingPage/) extension by Lenny.
