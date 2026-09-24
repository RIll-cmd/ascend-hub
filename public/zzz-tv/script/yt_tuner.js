/**
 * CRT YouTube On-Screen Tuner & Search HUD
 * Enables real-time YouTube search, direct frequency tuning,
 * preset streaming channels, and automatic dead-video error recovery.
 *
 * Clickable directly on the CRT TV screen when channel is YouTube!
 */

export function initYouTubeTuner(tvContentManager, updateDial) {
  const panel = document.getElementById("crt-yt-tuner-panel");
  const tvOverlay = document.getElementById("tv-container-overlay");
  const closeBtn = document.getElementById("tuner-close-btn");
  const errorBanner = document.getElementById("tuner-error-banner");
  const searchForm = document.getElementById("tuner-search-form");
  const searchInput = document.getElementById("tuner-search-input");
  const resultsList = document.getElementById("tuner-results-list");
  const pills = document.querySelectorAll(".tuner-pill");

  if (!panel || !tvOverlay) {
    console.warn("CRT YouTube Tuner elements not found");
    return;
  }

  let isOpen = false;
  let isLoading = false;
  let currentResults = [];

  function openTuner(errorMessage = null) {
    isOpen = true;
    panel.style.display = "flex";
    panel.setAttribute("aria-hidden", "false");
    tvOverlay.classList.add("tuner-open");

    if (errorMessage) {
      if (errorBanner) {
        errorBanner.textContent = `⚠️ ${errorMessage}`;
        errorBanner.style.display = "flex";
      }
    } else if (errorBanner) {
      errorBanner.style.display = "none";
    }

    if (searchInput) {
      setTimeout(() => searchInput.focus(), 120);
    }

    // If no results yet, load featured default streams
    if (!currentResults.length) {
      executeSearch("");
    }
  }

  function closeTuner() {
    isOpen = false;
    panel.style.display = "none";
    panel.setAttribute("aria-hidden", "true");
    tvOverlay.classList.remove("tuner-open");
    if (errorBanner) {
      errorBanner.style.display = "none";
    }
  }

  function toggleTuner() {
    if (isOpen) {
      closeTuner();
    } else {
      openTuner();
    }
  }

  function updateOverlayChannelState(inputType) {
    const isYt = inputType === "youtube";
    if (isYt) {
      tvOverlay.classList.add("is-youtube");
      tvOverlay.setAttribute("title", "Click CRT screen to search & tune YouTube");
    } else {
      tvOverlay.classList.remove("is-youtube");
      tvOverlay.removeAttribute("title");
      if (isOpen) {
        closeTuner();
      }
    }
  }

  async function executeSearch(query) {
    if (isLoading) return;
    isLoading = true;

    if (resultsList) {
      resultsList.innerHTML = `
        <div class="tuner-status-msg">
          <span class="tuner-spinner"></span>
          <span>SCANNING FREQUENCIES...</span>
        </div>
      `;
    }

    try {
      const url = query
        ? `/api/youtube/search?q=${encodeURIComponent(query)}`
        : `/api/youtube/search`;
      const res = await fetch(url);
      const data = await res.json();

      if (data && Array.isArray(data.results) && data.results.length > 0) {
        currentResults = data.results;
        renderResults(data.results);
      } else {
        renderEmptyState("NO BROADCASTS DETECTED. TRY ANOTHER FREQUENCY.");
      }
    } catch (err) {
      console.error("CRT Tuner search error:", err);
      renderEmptyState("FREQUENCY SCAN FAILED. CHECK NETWORK.");
    } finally {
      isLoading = false;
    }
  }

  function renderResults(results) {
    if (!resultsList) return;
    resultsList.innerHTML = "";

    results.forEach((item) => {
      const card = document.createElement("div");
      card.className = "tuner-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      const isLiveBadge = item.isLive || item.duration === "LIVE";

      card.innerHTML = `
        <div class="tuner-card-thumb">
          <img src="${item.thumbnail || ""}" alt="${escapeHtml(item.title)}" loading="lazy" />
          <span class="tuner-card-badge ${isLiveBadge ? "live" : ""}">${isLiveBadge ? "● LIVE" : escapeHtml(item.duration || "")}</span>
        </div>
        <div class="tuner-card-info">
          <div class="tuner-card-title">${escapeHtml(item.title)}</div>
          <div class="tuner-card-author">${escapeHtml(item.author || "YouTube Broadcast")}</div>
        </div>
        <div class="tuner-card-action">
          <span>TUNE ▶</span>
        </div>
      `;

      const playItem = () => {
        if (tvContentManager && typeof tvContentManager.playYouTubeDirect === "function") {
          tvContentManager.playYouTubeDirect(
            item.id,
            false,
            Boolean(item.isLive),
            item.title
          );
          if (typeof updateDial === "function") {
            updateDial();
          }
        }
        closeTuner();
      };

      card.addEventListener("click", (e) => {
        e.stopPropagation();
        playItem();
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playItem();
        }
      });

      resultsList.appendChild(card);
    });
  }

  function renderEmptyState(msg) {
    if (!resultsList) return;
    resultsList.innerHTML = `
      <div class="tuner-status-msg">
        <span>⚠️ ${escapeHtml(msg)}</span>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Click on TV Screen Handler ---
  tvOverlay.addEventListener("click", (e) => {
    // Only handle if clicking directly on the overlay backdrop
    if (e.target !== tvOverlay) return;

    const currentInput = typeof tvContentManager.getCurrentInputType === "function"
      ? tvContentManager.getCurrentInputType()
      : (tvContentManager.currentInputType || "");

    if (currentInput === "youtube") {
      e.stopPropagation();
      toggleTuner();
    }
  });

  // Close Button
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTuner();
    });
  }

  // Search Form Submit
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = searchInput ? searchInput.value.trim() : "";
      executeSearch(query);
    });
  }

  // Quick Preset Pills
  pills.forEach((pill) => {
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      const q = pill.getAttribute("data-query");
      if (q) {
        if (searchInput) searchInput.value = q;
        executeSearch(q);
      }
    });
  });

  // Hotkey support: ESC to close
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) {
      closeTuner();
    }
  });

  // Listen for channel/input changes from TVContentManager
  window.addEventListener("tv-input-changed", (e) => {
    const inputType = e.detail?.inputType || "";
    updateOverlayChannelState(inputType);
  });

  // Initial channel check
  const initialInput = typeof tvContentManager.getCurrentInputType === "function"
    ? tvContentManager.getCurrentInputType()
    : (tvContentManager.currentInputType || "");
  updateOverlayChannelState(initialInput);

  // Listen for video unavailable / player errors to open tuner
  window.addEventListener("yt-error", (e) => {
    console.warn("CRT Tuner intercepted YouTube player error:", e.detail);
    openTuner("BROADCAST OFFLINE (VIDEO UNAVAILABLE) — SELECT A WORKING STREAM BELOW:");
  });

  // Stop click bubbling on tuner panel
  panel.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  console.log("CRT YouTube Tuner (Screen Clickable Mode) initialized");
}
