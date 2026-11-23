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

  // ---- Track last known content time (updated when NOT in an ad) ----
  let lastKnownTime = 0;
  let lastKnownVid = null;
  setInterval(() => {
    if (isAdPlaying()) return;
    const v = document.querySelector('video');
    if (v && v.currentTime > 0 && isFinite(v.currentTime)) {
      lastKnownTime = Math.floor(v.currentTime);
    }
    // Also capture from URL on every tick
    const vid = new URLSearchParams(location.search).get('v');
    if (vid) lastKnownVid = vid;
  }, 500);

  // Also track via mutation observer on video changes
  new MutationObserver(() => {
    if (isAdPlaying()) return;
    const v = document.querySelector('video');
    if (v && v.currentTime > 0 && isFinite(v.currentTime)) {
      lastKnownTime = Math.floor(v.currentTime);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true });

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

    // If an ad is showing, use lastKnownTime (captured before ad started)
    // getCurrentTime() during an ad returns AD time, not content time — wrong!
    let contentTime = null;
    if (isAdPlaying()) {
      if (lastKnownTime > 0) contentTime = lastKnownTime;
    } else {
      try {
        const player = document.querySelector('#movie_player');
        if (player && typeof player.getCurrentTime === 'function') {
          const t = player.getCurrentTime();
          if (t > 0 && isFinite(t)) contentTime = Math.floor(t);
        }
      } catch (e) {}
      if (contentTime === null && lastKnownTime > 0) contentTime = lastKnownTime;
      const v0 = document.querySelector('video');
      if (contentTime === null && v0 && v0.currentTime > 0) contentTime = Math.floor(v0.currentTime);
    }

    const v = document.querySelector('video');

    if (v) {
      info.videoTime = contentTime;
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
  const MAX_RELOADS = 3;
  let reloadCount = 0;
  const POST_RELOAD_GRACE = 15000; // ignore ads for 15s after a reload (prevents loops)

  function recentlyReloaded() {
    try {
      const ts = sessionStorage.getItem('yt-ad-reloader-reloadts');
      if (ts && Date.now() - parseInt(ts, 10) < POST_RELOAD_GRACE) return true;
    } catch (e) {}
    return false;
  }

  function handleAd() {
    if (reloadPending) return;
    // Grace period after a reload — YouTube often serves the same ad again,
    // which would cause an infinite reload loop. Wait it out.
    if (recentlyReloaded()) return;
    const now = Date.now();
    if (now - lastAdCheck < RELOAD_COOLDOWN) return;
    lastAdCheck = now;

    const adInfo = captureAdInfo();
    LOG('Ad detected!', adInfo.advertiser, 'videoTime:', adInfo.videoTime);

    const t = adInfo.videoTime;
    const vid = adInfo.videoId;

    if (reloadCount < MAX_RELOADS) {
      // Strategy 1: Reload page (works ~90% of the time after 1-2 reloads)
      reloadCount++;
      saveAdEvent({ ...adInfo, action: 'reloaded', reloadedAt: Date.now(), attempt: reloadCount });
      if (t !== null && t > 0 && vid) {
        try {
          sessionStorage.setItem('yt-ad-reloader-time', String(t));
          sessionStorage.setItem('yt-ad-reloader-vid', vid);
          sessionStorage.setItem('yt-ad-reloader-reloadts', String(Date.now()));
        } catch (e) {}
        const url = new URL(location.href);
        url.searchParams.set('t', t + 's');
        LOG('Reloading to', url.toString(), '(attempt', reloadCount, ')');
        reloadPending = true;
        location.replace(url.toString());
      } else {
        LOG('No timestamp, plain reload (attempt', reloadCount, ')');
        try { sessionStorage.setItem('yt-ad-reloader-reloadts', String(Date.now())); } catch (e) {}
        reloadPending = true;
        location.reload();
      }
    } else {
      // Strategy 2: Redirect to yout-ube.com (ad-free mirror, no ads)
      // loop=0 prevents the infinite replay issue
      if (vid) {
        const youtUrl = 'https://www.yout-ube.com/watch?v=' + vid + (t > 0 ? '&t=' + t + 's' : '') + '&loop=0&autoplay=1';
        LOG('Max reloads reached, redirecting to yout-ube.com:', youtUrl);
        saveAdEvent({ ...adInfo, action: 'redirected_to_yout_ube', reloadedAt: Date.now() });
        reloadPending = true;
        location.replace(youtUrl);
      } else {
        reloadCount = 0;
        reloadPending = true;
        location.reload();
      }
    }
  }

  // Reset reload count when an ad-free page loads
  setInterval(() => {
    if (!isAdPlaying()) reloadCount = 0;
  }, 2000);

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
        if (!v) return;
        let attempts = 0;
        const seek = () => {
          attempts++;
          // Try YouTube player API first
          try {
            const player = document.querySelector('#movie_player');
            if (player && typeof player.seekTo === 'function') {
              player.seekTo(t, true);
              LOG('Seeked via player API to', t);
            }
          } catch (e) {}
          // Also set video element directly
          try { v.currentTime = t; } catch (e) {}
          // Play
          v.play().catch(() => {});
          // Verify after a short delay; retry if not close
          setTimeout(() => {
            if (Math.abs(v.currentTime - t) > 3 && attempts < 5) {
              LOG('Seek drift, retrying... (attempt', attempts, ')');
              seek();
            } else {
              LOG('Restored to', Math.floor(v.currentTime), 's');
              sessionStorage.removeItem('yt-ad-reloader-time');
              sessionStorage.removeItem('yt-ad-reloader-vid');
            }
          }, 1500);
        };
        if (v.readyState >= 2) {
          seek();
        } else {
          v.addEventListener('loadedmetadata', seek, { once: true });
          // Fallback if loadedmetadata never fires
          setTimeout(() => { if (v.readyState < 2) seek(); }, 3000);
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
