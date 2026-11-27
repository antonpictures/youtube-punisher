const test = require('node:test');
const assert = require('node:assert/strict');
const { createRetryState, isSuccessfulPlayback } = require('../retry-state.js');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('reload attempts survive content-script recreation', () => {
  const storage = memoryStorage();
  createRetryState(storage).recordReload('video-a', 42.5, 1000);

  const reloadedScript = createRetryState(storage);
  assert.deepEqual(reloadedScript.read('video-a'), {
    videoId: 'video-a',
    reloadCount: 1,
    tabSwitchAttempts: 0,
    playbackTime: 42.5,
    lastReloadAt: 1000,
  });
});

test('three reloads lead to a persisted fallback attempt', () => {
  const storage = memoryStorage();
  const state = createRetryState(storage);
  state.recordReload('video-a', null, 1000);
  state.recordReload('video-a', null, 2000);
  state.recordReload('video-a', null, 3000);

  assert.equal(state.read('video-a').reloadCount, 3);
  state.recordTabSwitch('video-a');
  assert.equal(createRetryState(storage).read('video-a').tabSwitchAttempts, 1);
});

test('a missing timestamp on a later reload preserves the useful position', () => {
  const storage = memoryStorage();
  const state = createRetryState(storage);
  state.recordReload('video-a', 125.75, 1000);
  state.recordReload('video-a', null, 2000);
  state.recordReload('video-a', 0, 3000);

  assert.equal(state.read('video-a').playbackTime, 125.75);
});

test('navigating to another video starts clean state', () => {
  const storage = memoryStorage();
  const state = createRetryState(storage);
  state.recordReload('video-a', 90, 1000);

  assert.deepEqual(state.read('video-b'), {
    videoId: 'video-b',
    reloadCount: 0,
    tabSwitchAttempts: 0,
    playbackTime: null,
    lastReloadAt: 0,
  });
});

test('confirmed content playback can clear all retry data', () => {
  const storage = memoryStorage();
  const state = createRetryState(storage);
  state.recordReload('video-a', 90, 1000);
  state.recordTabSwitch('video-a');
  state.reset('video-a');

  assert.deepEqual(createRetryState(storage).read('video-a'), {
    videoId: 'video-a',
    reloadCount: 0,
    tabSwitchAttempts: 0,
    playbackTime: null,
    lastReloadAt: 0,
  });
});

test('playback is not successful before the player is ready and playing', () => {
  const video = { readyState: 1, paused: false, currentTime: 30 };
  assert.equal(isSuccessfulPlayback(video), false);

  video.readyState = 2;
  video.paused = true;
  assert.equal(isSuccessfulPlayback(video), false);
  video.paused = false;
  assert.equal(isSuccessfulPlayback(video), true);
});
