# YouTube Ad Reloader

A Chrome extension that auto-reloads YouTube pages when an ad plays, preserving your playback position.

Built for the "ad every 60 seconds" problem on YouTube. When an ad is detected, it captures your current video timestamp, reloads the page, and YouTube auto-seeks back to where you were.

## Install on any Mac (or PC)

### Option A — Load unpacked (developer mode)
1. Download or clone this repo:
   ```
   git clone https://github.com/antonpictures/yt-ad-reloader.git
   ```
2. Open `chrome://extensions` in Chrome (or `brave://extensions`, `edge://extensions`)
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `yt-ad-reloader` folder
6. The extension activates on all YouTube pages automatically

### Option B — Install from a zip
1. Download the latest release zip from the [Releases page](https://github.com/antonpictures/yt-ad-reloader/releases)
2. Unzip it
3. Follow steps 2–5 above

## How it works
- Detects ads via `.ad-showing` class, skip button, and ad overlay elements
- Checks every 500ms + MutationObserver for instant detection
- On ad: captures `video.currentTime`, saves to sessionStorage, reloads with `&t=Xs` in URL
- YouTube auto-seeks to the timestamp after reload
- 3-second cooldown prevents reload loops
- Works on regular videos (timestamp preserved) and live streams (plain reload)

## Limitations
- YouTube changes DOM class names periodically; if ads aren't detected, check the console for `[YT-AdReloader]` logs
- Some ads (mid-roll on live streams) can't preserve position — plain reload
- YouTube's "Premium" upsell interstitials may need a second reload cycle (handled by cooldown)

## Files
- `manifest.json` — Chrome extension manifest v3
- `content.js` — ad detection + reload + timestamp restore
- `background.js` — minimal service worker

## License
MIT — do whatever you want with it.

Built with Alice (SIFTA) for George Anton.
