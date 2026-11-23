// YouTube Ad Reloader — content script with ad history tracking
(function () {
  'use strict';

  const LOG = (...a) => console.log('[YT-AdReloader]', ...a);
  const MAX_HISTORY = 1000;

  // ---- Ad detection ----
  function isAdPlaying() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return false;
    if (player.classList.contains('ad-showing')) return true;
    const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
    if (skipBtn && skipBtn.offsetParent !== null) return true;
    const adOverlay = document.querySelector('.ytp-ad-overlay-container .ytp-ad-text, .ytp-ad-player-overlay, .ytp-ad-preview-container');
    if (adOverlay && adOverlay.offsetParent !== null) return true;
    return false;
  }

  // ---- Capture ad metadata ----
  function captureAdInfo() {
    const info = {
      ts: Date.now(),
      pageUrl: location.href,
      videoId: new URLSearchParams(location.search).get('v') || null,
      videoTitle: document.title.replace(' - YouTube', '').trim(),
      videoTime: null,
      adVideoSrc: null,
      advertiser: null,
      adDuration: null,
      skipAvailable: false,
      skipButtonText: null,
    };

    const v = document.querySelector('video');
    if (v) {
      info.videoTime = Math.floor(v.currentTime);
      info.adVideoSrc = v.src || v.currentSrc || null;
      info.adDuration = v.duration && isFinite(v.duration) ? Math.floor(v.duration) : null;
    }

    // Advertiser name from DOM
    const advSelectors = [
      '.ytp-ad-player-overlay-layout__advertiser',
      '.ytp-ad-text',
      '.ytp-ad-preview-text',
      '.ytp-ad-simple-ad-badge',
      '[class*="advertiser"]',
    ];
    for (const sel of advSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        info.advertiser = el.textContent.trim().slice(0, 100);
        break;
      }
    }

    // Skip button text
    const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
    if (skipBtn) {
      info.skipAvailable = true;
      info.skipButtonText = skipBtn.textContent.trim().slice(0, 50);
    }

    // Try to extract ad ID from video src or page
    if (info.adVideoSrc) {
      try {
        const u = new URL(info.adVideoSrc);
        info.adId = u.searchParams.get('adurl') || u.searchParams.get('adid') || u.searchParams.get('id') || null;
        // googlevideo ad URLs often have the ad ID in the path
        if (!info.adId) {
          const m = info.adVideoSrc.match(/\/([^/]+)\.mp4/);
          if (m) info.adId = m[1].slice(0, 40);
        }
      } catch (e) {}
    }

    // Also check for ad metadata in window.ytInitialPlayerResponse
    try {
      const pr = window.ytInitialPlayerResponse;
      if (pr && pr.adPlacements) {
        const ad = pr.adPlacements[0];
        if (ad) {
          info.adPlacementType = ad.adPlacementConfig?.adPlacementConfigType || null;
          const renderer = ad?.renderer?.companions?.[0] || ad?.renderer;
          if (renderer) {
            info.adTitle = renderer?.title || renderer?.headline || null;
          }
        }
      }
    } catch (e) {}

    return info;
  }

  // ---- Save to history ----
  function saveAdEvent(event) {
    try {
      chrome.storage.local.get('ad_history', (data) => {
        const history = data.ad_history || [];
        history.unshift(event);
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
        chrome.storage.local.set({ ad_history: history }, () => {
          LOG('Saved ad event. Total:', history.length);
        });
      });
    } catch (e) {
      LOG('Storage error:', e);
    }
  }

  // ---- Reload with timestamp preservation ----
  let reloadPending = false;
  let lastAdCheck = 0;
  const CHECK_INTERVAL = 500;
  const RELOAD_COOLDOWN = 3000;

  function handleAd() {
    if (reloadPending) return;
    const now = Date.now();
    if (now - lastAdCheck < RELOAD_COOLDOWN) return;
    lastAdCheck = now;

    const adInfo = captureAdInfo();
    LOG('Ad detected!', adInfo.advertiser, 'videoTime:', adInfo.videoTime);

    // Save the ad event
    saveAdEvent({ ...adInfo, action: 'reloaded', reloadedAt: Date.now() });

    const t = adInfo.videoTime;
    const vid = adInfo.videoId;

    if (t !== null && t > 0 && vid) {
      try {
        sessionStorage.setItem('yt-ad-reloader-time', String(t));
        sessionStorage.setItem('yt-ad-reloader-vid', vid);
      } catch (e) {}
      const url = new URL(location.href);
      url.searchParams.set('t', t + 's');
      LOG('Reloading to', url.toString());
      reloadPending = true;
      location.replace(url.toString());
    } else {
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
      const currentVid = new URLSearchParams(location.search).get('v');
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

    const observer = new MutationObserver(() => {
      if (isAdPlaying()) handleAd();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    setInterval(() => {
      if (isAdPlaying()) handleAd();
    }, CHECK_INTERVAL);

    LOG('Initialized. Watching for ads...');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
