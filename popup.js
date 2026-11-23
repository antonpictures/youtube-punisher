// Popup logic for YouTube Ad Reloader
document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('list');
  const countEl = document.getElementById('count');
  const statsEl = document.getElementById('stats');

  function load() {
    chrome.storage.local.get('ad_history', (data) => {
      const history = data.ad_history || [];
      countEl.textContent = history.length + ' ads';
      if (history.length === 0) {
        listEl.innerHTML = '<div class="empty">No ads recorded yet.</div>';
        statsEl.textContent = '';
        return;
      }

      // Stats
      const advertisers = {};
      let totalReloads = 0;
      history.forEach(e => {
        const a = e.advertiser || 'Unknown';
        advertisers[a] = (advertisers[a] || 0) + 1;
        if (e.action === 'reloaded') totalReloads++;
      });
      const topAdv = Object.entries(advertisers).sort((a,b) => b[1]-a[1]).slice(0,3).map(([k,v]) => `${k} (${v})`).join(', ');
      statsEl.textContent = `Reloads: ${totalReloads} | Top advertisers: ${topAdv}`;

      // Render list
      listEl.innerHTML = history.map(e => {
        const d = new Date(e.ts);
        const timeStr = d.toLocaleString();
        const videoTitle = (e.videoTitle || 'Unknown video').slice(0, 60);
        const adv = e.advertiser || 'Unknown advertiser';
        const badge = e.action === 'reloaded'
          ? '<span class="badge reload">reloaded</span>'
          : '<span class="badge skip">skipped</span>';
        const meta = [];
        if (e.videoTime !== null) meta.push(`at ${e.videoTime}s`);
        if (e.adDuration) meta.push(`${e.adDuration}s ad`);
        if (e.skipAvailable) meta.push(`skip: ${e.skipButtonText || 'yes'}`);
        return `<div class="entry">
          <div class="row1"><span class="adv">${esc(adv)}${badge}</span><span class="time">${timeStr}</span></div>
          <div class="video">${esc(videoTitle)}</div>
          <div class="meta">${meta.join(' · ')}</div>
        </div>`;
      }).join('');
    });
  }

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Export JSON
  document.getElementById('export').addEventListener('click', () => {
    chrome.storage.local.get('ad_history', (data) => {
      const blob = new Blob([JSON.stringify(data.ad_history || [], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yt-ad-history-' + new Date().toISOString().slice(0,10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // Export CSV
  document.getElementById('exportCsv').addEventListener('click', () => {
    chrome.storage.local.get('ad_history', (data) => {
      const history = data.ad_history || [];
      const headers = ['timestamp', 'advertiser', 'videoTitle', 'videoId', 'videoTime', 'adDuration', 'action', 'pageUrl'];
      const rows = history.map(e => headers.map(h => {
        const v = e[h] !== undefined ? e[h] : '';
        return '"' + String(v).replace(/"/g, '""') + '"';
      }).join(','));
      const csv = headers.join(',') + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yt-ad-history-' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // Clear all
  document.getElementById('clear').addEventListener('click', () => {
    if (confirm('Clear all ad history?')) {
      chrome.storage.local.set({ ad_history: [] }, load);
    }
  });

  load();
});
