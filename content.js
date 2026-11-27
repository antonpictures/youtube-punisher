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

  // ---- Track last known content time ----
  let lastKnownTime = 0;
  let lastKnownVid = null;
  function trackContentTime() {
    const vid = currentVideoId();
    if (vid !== lastKnownVid) {
      lastKnownVid = vid;
      lastKnownTime = 0;
    }
    if (isAdPlaying()) return;
    const v = document.querySelector('video');
    if (v && v.currentTime > 0 && isFinite(v.currentTime)) {
      lastKnownTime = Math.floor(v.currentTime);
    }
  }

  setInterval(trackContentTime, 500);
  new MutationObserver(trackContentTime)
    .observe(document.body, { childList: true, subtree: true, attributes: true });

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

    let contentTime = null;
    if (isAdPlaying()) {
      if (info.videoId === lastKnownVid && lastKnownTime > 0) contentTime = lastKnownTime;
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

    const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
    if (skipBtn) {
      info.skipAvailable = true;
      info.skipButtonText = skipBtn.textContent.trim().slice(0, 50);
    }

    if (info.adVideoSrc) {
      try {
        const u = new URL(info.adVideoSrc);
        info.adId = u.searchParams.get('adurl') || u.searchParams.get('adid') || u.searchParams.get('id') || null;
        if (!info.adId) {
          const m = info.adVideoSrc.match(/\/([^/]+)\.mp4/);
          if (m) info.adId = m[1].slice(0, 40);
        }
      } catch (e) {}
    }

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
  const CHECK_INTERVAL = 150;
  const RELOAD_COOLDOWN = 1200;
  const MAX_RELOADS = 3;
  const POST_RELOAD_GRACE = 2500;
  const retryState = YTAdReloaderRetryState.createRetryState(sessionStorage);

  function currentVideoId() {
    return new URLSearchParams(location.search).get('v');
  }

  function recentlyReloaded() {
    const state = retryState.read(currentVideoId());
    return state.lastReloadAt > 0 && Date.now() - state.lastReloadAt < POST_RELOAD_GRACE;
  }

  function handleAd() {
    if (reloadPending) return;
    if (recentlyReloaded()) return;
    const now = Date.now();
    if (now - lastAdCheck < RELOAD_COOLDOWN) return;
    lastAdCheck = now;

    const adInfo = captureAdInfo();
    LOG('Ad detected!', adInfo.advertiser, 'videoTime:', adInfo.videoTime);

    const savedState = retryState.read(adInfo.videoId);
    // On a repeated pre-roll page the video element may expose the ad's time,
    // not the content time. Keep the last known content position instead.
    const t = savedState.playbackTime ?? adInfo.videoTime;
    const vid = adInfo.videoId;

    if (savedState.reloadCount < MAX_RELOADS) {
      const state = retryState.recordReload(vid, t);
      saveAdEvent({ ...adInfo, action: 'reloaded', reloadedAt: Date.now(), attempt: state.reloadCount });
      if (t !== null && t > 0 && vid) {
        const url = new URL(location.href);
        url.searchParams.set('t', t + 's');
        LOG('Reloading to', url.toString(), '(attempt', state.reloadCount, ')');
        reloadPending = true;
        location.replace(url.toString());
      } else {
        LOG('No timestamp, plain reload (attempt', state.reloadCount, ')');
        reloadPending = true;
        location.reload();
      }
    } else if (savedState.tabSwitchAttempts < 1) {
      retryState.recordTabSwitch(vid);
      LOG('Max reloads reached — auto tab-switch escape');
      saveAdEvent({ ...adInfo, action: 'auto_tab_switch', reloadedAt: Date.now() });
      reloadPending = true;
      try { chrome.runtime.sendMessage({ type: 'escape-loop' }, (resp) => {
        LOG('Tab-switch done:', resp);
        reloadPending = false;
        setTimeout(() => { if (isAdPlaying()) handleAd(); }, 1000);
      }); } catch (e) {
        LOG('sendMessage error:', e);
        reloadPending = false;
      }
    } else {
      // Strategy 3: Redirect to yout-ube.com
      if (vid) {
        const youtUrl = 'https://www.yout-ube.com/watch?v=' + vid + (t > 0 ? '&t=' + t + 's' : '') + '&loop=0&autoplay=1';
        LOG('All strategies exhausted, redirecting to yout-ube.com:', youtUrl);
        saveAdEvent({ ...adInfo, action: 'redirected_to_yout_ube', reloadedAt: Date.now() });
        reloadPending = true;
        location.replace(youtUrl);
      } else {
        LOG('No video ID, waiting for ad to finish');
        reloadPending = false;
      }
    }
  }

  // When the tab regains focus after being backgrounded, re-evaluate without
  // discarding the retry history that selects the next fallback strategy.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(() => { if (isAdPlaying()) handleAd(); }, 500);
    }
  });

  // ---- Post-reload: seek to saved time ----
  let restoreAttempt = null;

  // Called from the ad-free branch of the main loop. Retry on a later tick
  // when the player has not mounted yet, and never seek during a known ad.
  function checkContentPlayback() {
    if (reloadPending) return;
    const videoId = currentVideoId();
    const state = retryState.read(videoId);
    if (!state.reloadCount) return;

    const v = document.querySelector('video');
    if (!v || v.readyState < 2) return;
    const t = state.playbackTime;
    const restored = t !== null && Math.abs(v.currentTime - t) <= 3;
    if (t !== null && !restored) {
      if (restoreAttempt?.videoId !== videoId || restoreAttempt.video !== v) {
        restoreAttempt = { videoId, video: v, count: 0, nextAt: 0 };
      }
      const now = Date.now();
      if (now < restoreAttempt.nextAt) return;
      if (restoreAttempt.count < 5) {
        restoreAttempt.count++;
        restoreAttempt.nextAt = now + 1500;
        try {
          const player = document.querySelector('#movie_player');
          if (typeof player?.seekTo === 'function') player.seekTo(t, true);
        } catch (e) {}
        try { v.currentTime = t; } catch (e) {}
        v.play().catch(() => {});
        return;
      }
    }

    if (!YTAdReloaderRetryState.isSuccessfulPlayback(v)) return;
    restoreAttempt = null;
    retryState.reset(videoId);
    LOG('Content playback confirmed — reset retry state');

    if (restored) {
      try {
        const clean = new URL(location.href);
        if (clean.searchParams.get('t') === t + 's') {
          clean.searchParams.delete('t');
          history.replaceState(null, '', clean.toString());
        }
      } catch (e) {}
    }
  }

  // ---- Main loop ----
  function init() {
    const observer = new MutationObserver(() => {
      if (isAdPlaying()) handleAd();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    setInterval(() => {
      if (isAdPlaying()) handleAd();
      else checkContentPlayback();
    }, CHECK_INTERVAL);

    LOG('Initialized. Watching for ads...');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
