const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { createRetryState } = require('../retry-state.js');

const sources = ['retry-state.js', 'content.js'].map((file) =>
  readFileSync(resolve(__dirname, '..', file), 'utf8'));

function startPage(storage, now, page = {}) {
  const intervals = new Map();
  const actions = [];
  const location = {
    href: 'https://www.youtube.com/watch?v=video-a&t=42s',
    search: '?v=video-a&t=42s',
    replace: (url) => actions.push(url),
    reload: () => actions.push('reload'),
  };
  const context = {
    URL, URLSearchParams, location,
    Date: { now: () => now },
    sessionStorage: storage,
    console: { log() {} },
    document: {
      title: 'Test video - YouTube',
      querySelector(selector) {
        if (selector === 'video') return page.video;
        if (selector === '.html5-video-player') {
          return { classList: { contains: () => page.adPlaying } };
        }
        return null;
      },
      addEventListener() {},
    },
    history: { replaceState: (_, __, url) => { location.href = url; } },
    MutationObserver: class { observe() {} },
    setInterval: (fn, delay) => intervals.set(delay, fn),
    setTimeout() {},
    chrome: { runtime: { sendMessage: (message) => actions.push(message.type) } },
  };
  sources.forEach((source) => runInNewContext(source, context));
  return { actions, location, tick: intervals.get(150) };
}

function setupStorage() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  return { storage, state: createRetryState(storage) };
}

test('restores a late player without seeking or clearing state during an ad', () => {
  const { storage, state } = setupStorage();
  state.recordReload('video-a', 42, 1000);
  const page = {};
  const { location, tick } = startPage(storage, 1100, page);
  tick();
  assert.equal(state.read('video-a').reloadCount, 1);

  page.video = { readyState: 1, paused: false, currentTime: 0, play: async () => {} };
  tick();
  assert.equal(page.video.currentTime, 0);
  page.video.readyState = 2;
  page.adPlaying = true;
  tick();
  assert.equal(page.video.currentTime, 0);
  assert.equal(state.read('video-a').reloadCount, 1);

  page.adPlaying = false;
  tick();
  assert.equal(page.video.currentTime, 42);
  assert.equal(state.read('video-a').reloadCount, 1);
  tick();
  assert.equal(state.read('video-a').reloadCount, 0);
  assert.equal(location.href, 'https://www.youtube.com/watch?v=video-a');
});

test('three ad reloads retain the timestamp and then trigger the tab switch', () => {
  const { storage, state } = setupStorage();
  state.recordReload('video-a', 42, 1000);

  for (const now of [3500, 6000]) {
    const page = startPage(storage, now, { adPlaying: true });
    page.tick();
    assert.deepEqual(page.actions, ['https://www.youtube.com/watch?v=video-a&t=42s']);
  }

  const page = startPage(storage, 8500, { adPlaying: true });
  page.tick();
  assert.deepEqual(page.actions, ['escape-loop']);
  assert.equal(state.read('video-a').reloadCount, 3);
  assert.equal(state.read('video-a').tabSwitchAttempts, 1);
});
