// YouTube Ad Reloader — content script
(function () {
  'use strict';

  const LOG = (...a) => console.log('[YT-AdReloader]', ...a);

  // ---- Ad detection ----
  function isAdPlaying() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return false;
    // Primary signal: player has ad-showing class
    if (player.classList.contains('ad-showing')) return true;
    // Secondary: skip button visible
    const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
    if (skipBtn && skipBtn.offsetParent !== null) return true;
    // Tertiary: ad overlay elements
    const adOverlay = document.querySelector('.ytp-ad-overlay-container .ytp-ad-text, .ytp-ad-player-overlay, .ytp-ad-preview-container');
    if (adOverlay && adOverlay.offsetParent !== null) return true;
    // Quaternary: video element src contains "googlevideo" ad patterns (less reliable)
    return false;
  }

  // ---- Timestamp capture ----
  function getVideoTime() {
    const v = document.querySelector('video');
    if (!v) return null;
    return Math.floor(v.currentTime);
  }

  function getVideoId() {
    const params = new URLSearchParams(location.search);
    return params.get('v') || null;
  }

  // ---- Reload with timestamp preservation ----
  let reloadPending = false;
  let lastAdCheck = 0;
  const CHECK_INTERVAL = 500; // ms
  const RELOAD_COOLDOWN = 3000; // ms after reload before checking again

  function handleAd() {
    if (reloadPending) return;
    const now = Date.now();
    if (now - lastAdCheck < RELOAD_COOLDOWN) return;
    lastAdCheck = now;

    const t = getVideoTime();
    const vid = getVideoId();
    LOG('Ad detected! currentTime =', t, 'videoId =', vid);

    if (t !== null && t > 0 && vid) {
      // Save to sessionStorage for post-reload restore
      try {
        sessionStorage.setItem('yt-ad-reloader-time', String(t));
        sessionStorage.setItem('yt-ad-reloader-vid', vid);
      } catch (e) {}
      // Reload with timestamp in URL
      const url = new URL(location.href);
      url.searchParams.set('t', t + 's');
      LOG('Reloading to', url.toString());
      reloadPending = true;
      location.replace(url.toString());
    } else {
      // No timestamp (live stream or unknown) — just reload
      LOG('No timestamp, plain reload');
      reloadPending = true;
      location.reload();
    }
  }

  // ---- Post-reload: seek to saved time if needed ----
  function restoreAfterReload() {
    try {
      const savedTime = sessionStorage.getItem('yt-ad-reloader-time');
      const savedVid = sessionStorage.getItem('yt-ad-reloader-vid');
      const currentVid = getVideoId();
      if (savedTime && savedVid && savedVid === currentVid) {
        const t = parseInt(savedTime, 10);
        LOG('Restoring playback to', t, 's');
        const v = document.querySelector('video');
        if (v) {
          const seek = () => {
            if (v.readyState >= 2) {
              v.currentTime = t;
              v.play().catch(() => {});
              sessionStorage.removeItem('yt-ad-reloader-time');
              sessionStorage.removeItem('yt-ad-reloader-vid');
            } else {
              v.addEventListener('loadedmetadata', seek, { once: true });
            }
          };
          seek();
        }
      }
    } catch (e) { LOG('restore error', e); }
  }

  // ---- Main loop ----
  function init() {
    restoreAfterReload();

    // Watch for ads using MutationObserver + interval
    const observer = new MutationObserver(() => {
      if (isAdPlaying()) handleAd();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    // Fallback interval
    setInterval(() => {
      if (isAdPlaying()) handleAd();
    }, CHECK_INTERVAL);

    LOG('Initialized. Watching for ads...');
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
