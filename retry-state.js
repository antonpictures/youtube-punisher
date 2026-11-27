(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.YTAdReloaderRetryState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'yt-ad-reloader-retry-state';

  function createRetryState(storage, key = STORAGE_KEY) {
    function empty(videoId) {
      return {
        videoId: videoId || null,
        reloadCount: 0,
        tabSwitchAttempts: 0,
        playbackTime: null,
        lastReloadAt: 0,
      };
    }

    function write(state) {
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch (e) {}
      return state;
    }

    function read(videoId) {
      let state;
      try {
        state = JSON.parse(storage.getItem(key));
      } catch (e) {}

      if (!state || state.videoId !== (videoId || null)) {
        return write(empty(videoId));
      }

      return {
        videoId: state.videoId,
        reloadCount: Number.isInteger(state.reloadCount) && state.reloadCount >= 0 ? state.reloadCount : 0,
        tabSwitchAttempts: Number.isInteger(state.tabSwitchAttempts) && state.tabSwitchAttempts >= 0 ? state.tabSwitchAttempts : 0,
        playbackTime: Number.isFinite(state.playbackTime) && state.playbackTime > 0 ? state.playbackTime : null,
        lastReloadAt: Number.isFinite(state.lastReloadAt) && state.lastReloadAt > 0 ? state.lastReloadAt : 0,
      };
    }

    function recordReload(videoId, playbackTime, now = Date.now()) {
      const state = read(videoId);
      state.reloadCount += 1;
      state.lastReloadAt = now;
      // A fresh ad page often reports 0. Keep the last useful content position.
      if (Number.isFinite(playbackTime) && playbackTime > 0) state.playbackTime = playbackTime;
      return write(state);
    }

    function recordTabSwitch(videoId) {
      const state = read(videoId);
      state.tabSwitchAttempts += 1;
      return write(state);
    }

    function reset(videoId) {
      const state = empty(videoId);
      try {
        storage.removeItem(key);
      } catch (e) {}
      return state;
    }

    return { read, recordReload, recordTabSwitch, reset };
  }

  function isSuccessfulPlayback(video) {
    return Boolean(
      video &&
      video.readyState >= 2 &&
      !video.paused &&
      Number.isFinite(video.currentTime) &&
      video.currentTime > 0
    );
  }

  return { STORAGE_KEY, createRetryState, isSuccessfulPlayback };
});
