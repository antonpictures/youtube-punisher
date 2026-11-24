# Chrome Web Store upload kit — 🎯 YouTube Ad Punisher v1.8.1

Zip to upload: `/tmp/yt-ad-punisher-1.8.1.zip` (manifest.json at root, 18 KB)
If that tmp path is gone, rebuild:
```bash
cd /Users/ioanganton/Music/ANTON_SIFTA/scratch/yt-ad-reloader
zip -r -X /tmp/yt-ad-punisher-1.8.1.zip manifest.json content.js background.js popup.html popup.js scoverlay.js icons -x '*.DS_Store'
```

---

## 1. Store listing

**Name (≤75 chars, 23 used):**
```
🎯 YouTube Ad Punisher
```

**Summary (≤132 chars, 123 used):**
```
Reloads YouTube when an ad plays, restoring your exact spot. Ad history stays local. No account, no tracking, nothing sent.
```

**Category:** `Productivity` (or `Accessibility`). Language: English.

**Description (≤16,384 chars):**
```
I don't want to watch any YouTube ads right now. 🎯 YouTube Ad Punisher reloads the page the moment an ad starts, then drops you back exactly where you were. Usually one or two reloads and the ad slot is empty. No skip button hunting. No waiting five seconds.

"Every reload is a vote: I will not watch your ad." — George Anton, creator

HOW IT WORKS
• Detects the ad overlay on YouTube
• Captures your exact playback position
• Reloads the page with the timestamp in the URL
• YouTube seeks back to your spot and playback resumes
• A short cooldown prevents reload loops
• After three failed attempts it switches tabs briefly (Chrome throttles background tabs, which clears the ad state), and as a last resort opens an ad-free mirror

FEATURES
• Timestamp preserved — never lose your place
• Live streams supported (plain reload)
• Ad history — every ad logged with advertiser, video, duration, skip text and timestamp
• Popup viewer — click the icon for stats, top advertisers and full history
• Export your ad history as JSON or CSV
• Works on youtube.com, www.youtube.com and m.youtube.com
• Minimal permissions: only "storage" and "tabs"

PRIVACY
Everything stays on your device. Ad history is stored with chrome.storage.local and is never transmitted. There is no account, no analytics, no remote server and no tracking. You can clear your history from the popup at any time.

LIMITATIONS
YouTube changes its page markup from time to time; if detection misses an ad, check the browser console for [YT-AdReloader] logs. Safari is not supported through this package (Chrome, Brave, Edge and Opera are). Incognito requires manually allowing the extension on the extension's details page.

Open source, MIT license. Source: https://github.com/antonpictures/youtube-punisher
```

**Screenshots:** Chrome requires at least one (1280×800 or 640×400). Ready files in this folder:
- `screenshot_clean.png` — 1280×800 RGB (no alpha) — main screenshot
- `tile_small.png` — 440×280 RGB — Small promo tile
- `tile_marquee.png` — 1400×560 RGB — Marquee promo tile (optional)

All are 24-bit RGB PNG (no alpha) at the exact sizes Chrome requires. "Image size is incorrect" errors come from alpha-channel PNGs or wrong dimensions — these files avoid both.

**Official URL:** Chrome only lets you pick a Search-Console-verified domain. The engine only offered `3reo.blogspot.com`. To use georgeanton.com as Official URL, first verify it in Google Search Console for the `iantongeorge` account. The free-text **Homepage URL** already points to the official landing page:
`https://georgeanton.com/youtube-ad-punisher.html` (live, HTTP 200).

---

## 2. Privacy tab — answers

For "Does this extension handle personal or sensitive user information?":
- Select **No** if you answer strictly. Justification: no personal or sensitive data is collected — only ad metadata (advertiser name, video title, timestamp) stored locally with `chrome.storage.local` and never transmitted.

If you prefer to provide a privacy policy URL, put your GitHub repo README URL:
`https://github.com/antonpictures/youtube-punisher#the-ad-history-database`

For "How does your extension use the data it collects?":
```
Ad metadata (advertiser, video title, playback timestamp, ad duration) is stored locally in chrome.storage.local so the popup can show the user their own ad history. It is never transmitted, sold, shared or used for any purpose outside the extension. The user can delete it at any time from the popup.
```

**Permissions justification (if the review form asks):**
- `storage`: to save the user's local ad history.
- `tabs`: to switch to a helper tab and back when breaking an ad loop.
- Host permissions for YouTube domains: the extension only runs on YouTube pages, because that is where ads are detected.

---

## 3. ⚠️ Review risk to decide before submitting

`content.js` lines 211-215 redirect to `https://www.yout-ube.com/...` as a last-resort fallback after three failed reloads. Chrome review may flag redirecting users to a third-party mirror as unexpected navigation. Two choices:

- **Keep it** (current v1.8.1, tested working) — include the "ad-free mirror" line in the description, as above, so the behavior is disclosed.
- **Remove it for store submission** — delete the redirect block, rebuild the zip, describe only the reload + tab-switch strategies. Safer for approval. Tell me and I'll build a store-safe zip.

The extension name "Punisher" and "Punish the ads" phrasing is fine, but "Punish" could read as aggressive to a reviewer. A neutral alternative name is "YouTube Ad Skipper by Reload" if you want maximum approval odds.

---

## 4. After upload

Fill Store Listing → Privacy → Distribution. Distribution: "Public". Pricing: free. Then "Submit for review". Review typically takes a few days to a couple of weeks.
