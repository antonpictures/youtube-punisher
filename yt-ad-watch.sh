#!/bin/bash
# yt-ad-watch.sh — Safari YouTube Ad Watcher
# 
# How it works:
#   1. Injects an overlay script into Safari that uses MutationObserver
#      (event-driven — fires when the ad DOM appears, no page polling).
#   2. The overlay sets document.title to "AD:<timestamp>" when an ad is
#      detected, and saves the timestamp to sessionStorage.
#   3. This AppleScript reads the title every 2s (lightweight — one property
#      read per cycle) and when it sees "AD:X" it reloads the page with
#      &t=Xs so you resume at the same timestamp.
#
# Requirements:
#   - Safari with "Develop > Execute JavaScript" enabled, or run from Xcode
#   - Run: ./yt-ad-watch.sh
#
# Note: Safari blocks ad-hoc signed extensions from injecting into YouTube.
# This script is a workaround that uses AppleScript injection instead.

SIGNAL_PREFIX="AD:"
LAST_SIGNAL=""

echo "YouTube Ad Watcher (Safari)"
echo "  Detected → reload with timestamp until ads are gone"
echo "  Press Ctrl+C to stop"
echo ""

INJECT_OVERLAY='
(function() {
  const AD_SELECTORS = [".ad-showing", ".ytp-ad-skip-button, .ytp-skip-ad-button", ".ytp-ad-player-overlay"];
  let handled = false;
  function isAdPlaying() {
    const player = document.querySelector(".html5-video-player");
    if (!player) return false;
    if (player.classList.contains("ad-showing")) return true;
    for (const sel of AD_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }
  function getVideoTime() {
    const v = document.querySelector("video");
    return v ? Math.floor(v.currentTime) : null;
  }
  const observer = new MutationObserver(() => {
    if (handled && isAdPlaying()) return;
    if (isAdPlaying()) {
      handled = true;
      const t = getVideoTime();
      document.title = "AD:" + (t !== null ? t : "");
    } else if (document.title.startsWith("AD:")) {
      handled = false;
      document.title = "Tube - YouTube";
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
})();
'

# Inject overlay into current Safari page
osascript -e "tell application \"Safari\" to do JavaScript \"$INJECT_OVERLAY\" in current tab of front window" 2>/dev/null
echo "[1/2] Overlay injected — watch for 'AD:<time>' in title when ads play"
echo "[2/2] Watching for signals..."

while true; do
  TITLE=$(osascript -e 'tell application "Safari" to do JavaScript "document.title" in current tab of front window' 2>/dev/null)
  
  if [[ "$TITLE" == "$SIGNAL_PREFIX"* ]]; then
    AD_TIME="${TITLE#$SIGNAL_PREFIX}"
    if [ "$TITLE" != "$LAST_SIGNAL" ]; then
      LAST_SIGNAL="$TITLE"
      echo "[$(date +%H:%M:%S)] AD detected — reloading with timestamp ${AD_TIME}s"
      if [ -n "$AD_TIME" ] && [ "$AD_TIME" != "None" ]; then
        # Reload with timestamp
        osascript -e "tell application \"Safari\" to do JavaScript \"
          const t = $AD_TIME;
          const vid = new URLSearchParams(location.search).get('v');
          if (t > 0 && vid) {
            sessionStorage.setItem('ytad_time', String(t));
            location.replace('https://www.youtube.com/watch?v=' + vid + '&t=' + t + 's');
          } else {
            location.reload();
          }
        \" in current tab of front window" 2>/dev/null
      else
        # No timestamp — plain reload
        osascript -e 'tell application "Safari" to do JavaScript "location.reload()" in current tab of front window' 2>/dev/null
      fi
      sleep 5  # cooldown
    fi
  else
    if [ -n "$LAST_SIGNAL" ]; then
      LAST_SIGNAL=""
      echo "[$(date +%H:%M:%S)] Ads cleared"
    fi
  fi
  sleep 2
done
