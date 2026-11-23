// Safari overlay — loaded via "Develop > Execute JavaScript" or a user script
// Detects YouTube ads via MutationObserver and triggers a reload via AppleScript
(function () {
  'use strict';

  const AD_SELECTORS = [
    '.ad-showing',
    '.ytp-ad-skip-button, .ytp-skip-ad-button',
    '.ytp-ad-player-overlay',
    '.ytp-ad-overlay-container .ytp-ad-text'
  ];

  function isAdPlaying() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return false;
    if (player.classList.contains('ad-showing')) return true;
    for (const sel of AD_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return true;
    }
    return false;
  }

  function getVideoTime() {
    const v = document.querySelector('video');
    return v ? Math.floor(v.currentTime) : null;
  }

  let handled = false;

  function onAdDetected() {
    if (handled) return;
    handled = true;

    // Capture timestamp, save to sessionStorage
    const t = getVideoTime();
    const vid = new URLSearchParams(location.search).get('v');
    if (t && vid) {
      sessionStorage.setItem('ytad_time', String(t));
      sessionStorage.setItem('ytad_vid', vid);
    }
    document.title = 'AD:' + (t || '?');
    window.__ytAdDetected = true;
    window.__ytAdTime = t;

    // Signal via title change and alert hook (AppleScript listener can poll the title)
    document.dispatchEvent(new CustomEvent('ytad-detected'));

    // Try to trigger AppleScript via alert hook
    if (window.webkit && window.webkit.messageHandlers) {
      // Safari extension messaging
    }
  }

  // MutationObserver — watches DOM, fires once when ad appears
  const observer = new MutationObserver(() => {
    if (isAdPlaying()) onAdDetected();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // Reset when ad clears (for multiple ad segments)
  setInterval(() => {
    if (!isAdPlaying() && handled) {
      handled = false;
      document.title = 'Tube - YouTube';
      delete window.__ytAdDetected;
      delete window.__ytAdTime;
    }
  }, 3000);

  // Initial check (in case already on ad when loaded)
  setTimeout(() => {
    if (isAdPlaying()) onAdDetected();
  }, 2000);
})();
