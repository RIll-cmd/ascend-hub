export function initYouTubeTuner(manager, updateDial) {
  const overlay = document.getElementById('tv-container-overlay');
  const panel = document.getElementById('crt-yt-tuner-panel');
  const trigger = document.getElementById('crt-yt-tuner-trigger');
  const slate = document.getElementById('yt-channel-slate');
  const reason = document.getElementById('yt-channel-reason');
  const input = document.getElementById('tuner-search-input');
  const results = document.getElementById('tuner-results-list');
  const notice = document.getElementById('tuner-error-banner');
  if (!overlay || !panel || !trigger) return;
  let failure = null, requestId = 0;
  const active = () => manager.getCurrentInputType() === 'youtube';
  const sync = () => {
    overlay.classList.toggle('channel-youtube', active());
    slate.hidden = !active() || failure === null;
    document.getElementById("tv-container").classList.toggle("youtube-owned-screen", active() && (failure !== null || !panel.hidden));
    trigger.hidden = !active();
    if (!active()) close(false);
  };
  function close(focus = true) {
    panel.hidden = true;
    document.getElementById("tv-container").classList.toggle("youtube-owned-screen", active() && failure !== null);
    if (focus && active()) trigger.focus();
  }
  function open() {
    if (!active()) return;
    panel.hidden = false;
    document.getElementById("tv-container").classList.add("youtube-owned-screen");
    input.focus();
    if (!results.children.length) search('');
  }
  function status(message) {
    results.replaceChildren();
    const text = document.createElement('p');
    text.className = 'tv-broadcast-empty';
    text.textContent = message;
    results.append(text);
  }
  async function search(query) {
    const id = ++requestId;
    status('Finding videos…'); notice.hidden = true;
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('search');
      const data = await response.json();
      if (id !== requestId) return;
      notice.hidden = false;
      notice.textContent = data.source === 'preset' ? (query ? 'Search unavailable · Recommendations instead' : 'Recommendations · Availability may change') : 'Select a video to tune';
      results.replaceChildren();
      const items = (data.results || []).filter(item => /^[a-zA-Z0-9_-]{11}$/.test(item.id));
      if (!items.length) return status('No videos found. Try another title or paste a link.');
      for (const item of items) {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'tv-broadcast-row';
        const image = document.createElement('img'); image.src = `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`; image.alt = ''; image.loading = 'lazy';
        const details = document.createElement('span');
        const title = document.createElement('strong'); title.textContent = item.title;
        const author = document.createElement('small'); author.textContent = item.author || 'YouTube';
        details.append(title, author);
        const duration = document.createElement('small'); duration.textContent = data.source === 'preset' ? 'Tune' : item.duration || 'Tune';
        row.append(image, details, duration);
        row.onclick = async () => {
          failure = null;
          await manager.playYouTubeDirect(item.id, false, Boolean(item.isLive), item.title);
          updateDial?.(); close(); sync();
        };
        results.append(row);
      }
    } catch {
      if (id === requestId) status('Search could not connect. Try again or paste a video link.');
    }
  }
  trigger.onclick = open;
  document.getElementById('tuner-close-btn').onclick = () => close();
  document.getElementById('yt-choose-video').onclick = open;
  const videoId = () => manager.youtubePlayer?.currentSelection?.videoId || manager.youtubePlayer?.youtubePlayer?.getVideoData?.().video_id;
  document.getElementById('yt-retry-video').onclick = () => {
    if (manager.youtubePlayer?.apiFailed) {
      failure = null; manager.youtubePlayer.retryConnection(); sync(); return;
    }
    const id = videoId(); if (!id) return open();
    failure = null;
    if (manager.youtubePlayer.youtubePlayerReady) manager.youtubePlayer.youtubePlayer.loadVideoById(id);
    else manager.youtubePlayer.updateYouTubePlayer(id);
    sync();
  };
  document.getElementById('yt-open-external').onclick = () => {
    const id = videoId();
    if (/^[a-zA-Z0-9_-]{11}$/.test(id || '')) window.open(`https://www.youtube.com/watch?v=${id}`, '_blank', 'noopener,noreferrer');
  };
  document.getElementById('tuner-search-form').onsubmit = event => { event.preventDefault(); search(input.value.trim()); };
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) close(); });
  window.addEventListener('tv-input-changed', sync);
  window.addEventListener('yt-error', event => {
    failure = event.detail?.code ?? 'unknown';
    reason.textContent = [101, 150].includes(failure) ? 'This creator does not allow playback on embedded TVs.' : failure === 100 ? 'This video is unavailable or has been removed.' : failure === 'api-unavailable' ? 'YouTube could not connect. Check your connection and try again.' : failure === 153 ? 'The player could not identify this TV connection.' : 'This video cannot play on this TV.';
    sync();
  });
  window.addEventListener('yt-playing', () => { failure = null; sync(); });
  sync();
}
