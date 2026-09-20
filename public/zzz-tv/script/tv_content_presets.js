export function createNoSignalPreset() {
  const container = document.createElement("div");
  container.classList.add("no-signal");

  const topSection = createSection([
    "top",
    "shell",
    "yellow",
    "light-blue",
    "green",
    "purple",
    "red",
    "blue",
  ]);
  // const middleSection = createSection([
  //   "middle",
  //   "blue",
  //   "black",
  //   "purple",
  //   "black",
  //   "blue",
  //   "black",
  //   "white",
  // ]);
  // const bottomSection = createSection([
  //   "bottom",
  //   "dark-blue",
  //   "white",
  //   "blue",
  //   "black",
  //   "black",
  //   "dark-blue",
  // ]);
  const gridOverSection = createMessageSection("SIGNAL", "LOST");

  container.append(topSection, 
    // middleSection, 
    // bottomSection, 
    gridOverSection);

  return container;
}

function createSection(classes) {
  const section = document.createElement("section");
  section.classList.add(classes[0]);

  for (let i = 1; i < classes.length; i++) {
    const subSection = document.createElement("section");
    subSection.classList.add(classes[i]);
    section.appendChild(subSection);
  }

  return section;
}

function createMessageSection(message1, message2) {
  const gridOverSection = document.createElement("section");
  gridOverSection.classList.add("grid-over");

  const messageContainer = document.createElement("section");
  messageContainer.classList.add("message-container");

  const messageParagraph = document.createElement("p");
  messageParagraph.classList.add("message");

  const messageSpan1 = document.createElement("span");
  messageSpan1.classList.add("message-part1");
  messageSpan1.textContent = message1;

  const messageSpan2 = document.createElement("span");
  messageSpan2.classList.add("message-part2");
  messageSpan2.textContent = message2;

  messageParagraph.appendChild(messageSpan1);
  messageParagraph.appendChild(document.createElement("br"));
  messageParagraph.appendChild(messageSpan2);

  messageContainer.appendChild(messageParagraph);
  gridOverSection.appendChild(messageContainer);

  return gridOverSection;
}



export function createImagePreset(src_img) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("image-container");
    const img_div = document.createElement("img");
    img_div.src = src_img;
    img_div.alt = "image";
    img_div.id = "image-content";
    
    container.appendChild(img_div);
    return container;
  };
}

export function createInfineBouncePreset(src_img) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("logo-bounce");

    const logo = document.createElement("img");
    logo.classList.add("logo");
    logo.src = src_img;
    logo.alt = "logo";

    container.appendChild(logo);

    return container;
  };
}

export const DEFAULT_COMMERCIALS = [
  "/COMMERCIALS/AD1.mp4",
  "/COMMERCIALS/AD2.mp4",
  "/COMMERCIALS/AD3.mp4",
  "/COMMERCIALS/AD4.mp4",
  "/COMMERCIALS/AD6.mp4",
  "/COMMERCIALS/AD7.mp4",
  "/COMMERCIALS/AD8.mp4",
  "/COMMERCIALS/AD9.mp4",
  "/COMMERCIALS/AD10.mp4",
  "/COMMERCIALS/AD11.mp4",
  "/COMMERCIALS/AD12.mp4",
  "/COMMERCIALS/AD13.mp4",
  "/COMMERCIALS/AD14.mp4",
  "/COMMERCIALS/AD15.mp4"
];

export const DEFAULT_SHOWS = [
  "/SHOWS/SHOW1.mp4",
  "/SHOWS/SHOW2.mp4",
  "/SHOWS/SHOW3.mp4",
  "/SHOWS/SHOW4.mp4",
  "/SHOWS/SHOW5.mp4",
  "/SHOWS/SGOW6.mp4",
  "/SHOWS/SHO7.mp4",
  "/SHOWS/SHOW%209.mp4",
  "/SHOWS/SHOW9.mp4",
  "/SHOWS/SHOW10.mp4"
];

export function createRandomVideoBroadcastPreset(wallpaperSettings = {}) {
  let commercials = [...DEFAULT_COMMERCIALS];
  let shows = [...DEFAULT_SHOWS];
  let isFetching = false;

  // Asynchronously query API for dynamic file discovery
  const updateFromApi = async () => {
    if (isFetching) return;
    isFetching = true;
    try {
      const res = await fetch("/api/zzz-videos");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.commercials) && data.commercials.length > 0) {
          commercials = data.commercials;
        }
        if (Array.isArray(data.shows) && data.shows.length > 0) {
          shows = data.shows;
        }
        console.log(`[VIDEO-0 Broadcast] Synced ${commercials.length} commercials and ${shows.length} shows from API.`);
      }
    } catch (e) {
      console.warn("[VIDEO-0 Broadcast] API fetch fallback to static defaults:", e);
    } finally {
      isFetching = false;
    }
  };

  updateFromApi();

  return () => {
    let isDestroyed = false;
    let isAdvancing = false;
    let errorTimeout = null;

    const container = document.createElement("div");
    container.classList.add("backgroundVideo-container");
    container.classList.add("crt-video-broadcast-wrap");

    const video = document.createElement("video");
    video.id = "backgroundVideo";
    video.className = "crt-video-player";
    video.playsInline = true;
    video.preload = "auto";
    video.autoplay = true;
    video.loop = false; // We advance to next random video instead of looping a single clip

    let lastCategory = null; // 'show' | 'commercial'
    let consecutiveCount = 0;
    const history = []; // Keep last 8 played URLs to prevent repeats

    function getNextVideoUrl() {
      const allVideos = [...shows, ...commercials];
      if (allVideos.length === 0) return "/COMMERCIALS/AD1.mp4";

      let targetPool;
      if (consecutiveCount >= 2 && lastCategory === "commercial" && shows.length > 0) {
        targetPool = shows;
        lastCategory = "show";
        consecutiveCount = 1;
      } else if (lastCategory === "show" && commercials.length > 0) {
        targetPool = commercials;
        lastCategory = "commercial";
        consecutiveCount = 1;
      } else {
        const pickShow = Math.random() < 0.5 && shows.length > 0;
        if (pickShow) {
          targetPool = shows;
          consecutiveCount = (lastCategory === "show") ? consecutiveCount + 1 : 1;
          lastCategory = "show";
        } else if (commercials.length > 0) {
          targetPool = commercials;
          consecutiveCount = (lastCategory === "commercial") ? consecutiveCount + 1 : 1;
          lastCategory = "commercial";
        } else {
          targetPool = allVideos;
          consecutiveCount = 1;
        }
      }

      let available = targetPool.filter(url => !history.includes(url));
      if (available.length === 0) {
        available = targetPool.filter(url => url !== history[history.length - 1]);
      }
      if (available.length === 0) {
        available = targetPool;
      }

      const chosen = available[Math.floor(Math.random() * available.length)];
      history.push(chosen);
      if (history.length > 8) history.shift();
      return chosen;
    }

    function destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      if (errorTimeout) {
        clearTimeout(errorTimeout);
        errorTimeout = null;
      }
      try {
        video.pause();
        video.muted = true;
        video.removeAttribute("src");
        video.load();
      } catch (_) {}
      try {
        container.remove();
      } catch (_) {}
    }

    video.destroy = destroy;

    function playClip(url) {
      if (isDestroyed) return;
      isAdvancing = false;
      video.src = url;
      video.load();
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (isDestroyed) return;
          console.warn("[VIDEO-0] Autoplay unmuted was blocked by browser, falling back to muted:", err);
          video.muted = true;
          video.play().catch(e => {
            if (!isDestroyed) console.error("[VIDEO-0] Playback failed:", e);
          });
        });
      }
    }

    function advanceToNext() {
      if (isDestroyed || isAdvancing) return;
      isAdvancing = true;
      const nextUrl = getNextVideoUrl();
      console.log(`[VIDEO-0 Broadcast] Now playing (${lastCategory}): ${nextUrl}`);
      playClip(nextUrl);
    }

    video.addEventListener("ended", () => {
      if (isDestroyed) return;
      advanceToNext();
    });

    video.addEventListener("error", (e) => {
      if (isDestroyed) return;
      if (!video.src || video.src === window.location.href || video.src.endsWith("/")) return;
      console.warn("[VIDEO-0] Video load error, auto-advancing to next clip:", e);
      if (errorTimeout) clearTimeout(errorTimeout);
      errorTimeout = setTimeout(() => {
        if (!isDestroyed) advanceToNext();
      }, 500);
    });

    video.playNextRandomVideo = () => {
      if (isDestroyed) return;
      advanceToNext();
    };

    container.appendChild(video);

    // Launch initial random clip immediately
    advanceToNext();

    return { container, video };
  };
}

export function createBackgroundVideoPreset(
  src_video,
  video_type = "video/mp4",
  muted = true,
  loop = true
) {
  if (!src_video || src_video === "default" || src_video === "random" || src_video === "") {
    return createRandomVideoBroadcastPreset();
  }

  return () => {
    const container = document.createElement("div");
    container.classList.add("backgroundVideo-container");
    const video = document.createElement("video");
    video.id = "backgroundVideo";
    if (muted) {
      video.setAttribute("muted", "");
    }
    video.autoplay = true;
    video.loop = loop;
    video.preload = "auto";

    const source = document.createElement("source");
    source.src = src_video;
    source.type = video_type;

    video.appendChild(source);
    container.appendChild(video);

    return {container, video};
  };
}

export function createGifPreset(src_gif) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("gif-container"); // Add a class for styling if desired

    const gif = document.createElement("img");
    gif.src = src_gif; // Replace with the actual path to your GIF
    gif.alt = "GIF animation";
    gif.classList.add("gif-class"); // Optionally add a class for styling

    container.appendChild(gif);

    return container;
  };
}

export function createYouTubePreset(
  videoId,
  width = 640,
  height = 390,
  onPlayerReady
) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("youtube-container");

    const playerDiv = document.createElement("div");
    playerDiv.id = `youtube-player-${videoId}`;
    container.appendChild(playerDiv);

    console.log(`Creating YouTube player for videoId: ${videoId}`);

    const initYouTubePlayer = () => {
      console.log(`Initializing YouTube player for videoId: ${videoId}`);
      setTimeout(() => {
        if (document.getElementById(`youtube-player-${videoId}`)) {
          const player = new YT.Player(`youtube-player-${videoId}`, {
            height: height,
            width: width,
            videoId: videoId,
            playerVars: {
              autoplay: 1,
              controls: 0,
              loop: 1,
              playlist: videoId,
              modestbranding: 1,
              rel: 0,
              iv_load_policy: 3,
              disablekb: 1,
              fs: 0,
              playsinline: 1,
              origin: window.location.origin,
              enablejsapi: 1,
            },
            events: {
              onReady: (event) => {
                console.log(`YouTube player ready for videoId: ${videoId}`);
                event.target.playVideo();
                if (onPlayerReady) {
                  onPlayerReady(player);
                }
              },
              onStateChange: (event) => {
                console.log(
                  `YouTube player state change for videoId: ${videoId}, state: ${event.data}`
                );
                if (event.data === YT.PlayerState.ENDED) {
                  event.target.playVideo(); // Loop the video
                }
              },
              onError: (event) => {
                console.error(
                  `YouTube player error for videoId: ${videoId}, error: ${event.data}`
                );
                handleYouTubeError(event);
              },
              onPlaybackQualityChange: (event) => {
                console.log(
                  `Playback quality changed for videoId: ${videoId}, quality: ${event.data}`
                );
              },
              onPlaybackRateChange: (event) => {
                console.log(
                  `Playback rate changed for videoId: ${videoId}, rate: ${event.data}`
                );
              },
              onApiChange: () => {
                console.log(`API changed for videoId: ${videoId}`);
              },
              onAdStart: () => {
                console.log(`Ad started for videoId: ${videoId}`);
              },
              onAdEnd: () => {
                console.log(`Ad ended for videoId: ${videoId}`);
              },
              onAdError: (event) => {
                console.error(
                  `Ad error for videoId: ${videoId}, error: ${event.data}`
                );
                handleYouTubeAdError(event);
              },
            },
          });
        } else {
          console.error("YouTube player container not found.");
        }
      }, 500);
    };

    if (window.YT && window.YT.Player) {
      initYouTubePlayer();
    } else {
      console.log("Loading YouTube IFrame API...");
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = initYouTubePlayer;
    }

    return container;
  };
}

function handleYouTubeError(event) {
  const errorCodes = {
    2: "Invalid video ID",
    5: "HTML5 player issue",
    100: "Video not found",
    101: "Video not playable in embedded players",
    150: "Video not playable in embedded players",
  };
  console.error("YouTube error: ", errorCodes[event.data] || "Unknown error");
  // Implement fallback logic, such as switching to a "no signal" screen
}

function handleYouTubeAdError(event) {
  console.error("YouTube ad error: ", event.data);
  // Implement fallback logic for ad errors
}

export function createYouTubeNoCookiePreset(
  videoId,
  width = 640,
  height = 390
) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("youtube-container");

    const iframe = document.createElement("iframe");
    iframe.width = width;
    iframe.height = height;
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&loop=1&playlist=${videoId}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1`;
    iframe.frameBorder = "0";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    container.appendChild(iframe);

    return container;
  };
}

function monitorIframe(iframe) {
  setInterval(() => {
    try {
      const iframeDocument =
        iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDocument || iframeDocument.readyState === "complete") {
        console.log("Iframe is loaded and active.");
      } else {
        console.warn("Iframe is not responding, reloading...");
        iframe.src += "";
      }
    } catch (e) {
      console.error("Error accessing iframe: ", e);
    }
  }, 5000); // Check every 5 seconds
}

export function createYouTubeWithMonitorPreset(
  videoId,
  width = 640,
  height = 390,
  onPlayerReady
) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("youtube-container");

    const iframe = document.createElement("iframe");
    iframe.width = width;
    iframe.height = height;
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&loop=1&playlist=${videoId}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1`;
    iframe.frameBorder = "0";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    container.appendChild(iframe);

    monitorIframe(iframe);

    return container;
  };
}

export function createYouTubeiFrameWithFallbackPreset(
  videoId,
  width = 640,
  height = 390
) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("youtube-container");

    const iframe = document.createElement("iframe");
    iframe.width = width;
    iframe.height = height;
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&loop=1&playlist=${videoId}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1`;
    iframe.frameBorder = "0";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    container.appendChild(iframe);

    const reloadIframe = () => {
      iframe.src += "";
    };

    setInterval(() => {
      try {
        const iframeDocument =
          iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDocument || iframeDocument.readyState !== "complete") {
          console.warn("Iframe is not responding, reloading...");
          reloadIframe();
        }
      } catch (e) {
        console.error("Error accessing iframe: ", e);
        reloadIframe();
      }
    }, 5000); // Check every 5 seconds

    return container;
  };
}

export function createYouTubeiFramePreset(
  videoOrPlaylistId,
  width = 640,
  height = 390
) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("youtube-container");

    const iframe = document.createElement("iframe");
    iframe.width = width;
    iframe.height = height;

    const isPlaylist = videoOrPlaylistId.length > 11;
    const params = [
      "enablejsapi=1",
      "autoplay=1",
      "controls=0",
      "loop=1",
      "modestbranding=1",
      "rel=0",
      "iv_load_policy=3",
      "disablekb=1",
      "fs=0",
      "playsinline=1",
      "origin=" + window.location.origin,
    ];

    if (isPlaylist) {
      params.push("listType=playlist", `list=${videoOrPlaylistId}`);
    } else {
      params.push(`playlist=${videoOrPlaylistId}`);
    }

    iframe.src = `https://www.youtube.com/embed/${
      isPlaylist ? "" : videoOrPlaylistId
    }?${params.join("&")}`;
    iframe.frameBorder = "0";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    iframe.onerror = () => {
      console.error("Error loading YouTube iframe");
    };

    container.appendChild(iframe);
    console.log("YouTube iframe created and appended.");

    return container;
  };
}

export function createYouTubeiFrameLivePreset(
  channelId,
  width = 640,
  height = 390
) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("youtube-container");

    const iframe = document.createElement("iframe");
    iframe.id = "youtube-player";
    iframe.width = width;
    iframe.height = height;

    const baseUrl = "https://www.youtube.com/embed/live_stream?channel=";
    const params = [
      "enablejsapi=1",
      "autoplay=1",
      "controls=0",
      // 'loop=1'  // Uncomment if you want to loop the stream
    ];

    iframe.src = `${baseUrl}${channelId}&${params.join("&")}`;
    iframe.frameBorder = "0";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    container.appendChild(iframe);
    console.log("YouTube iframe created and appended.");

    return container;
  };
}

export function createTwitchiFramePreset(channel, width, height) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("twitch-container");

    const iframe = document.createElement("iframe");
    iframe.id = "twitch-player";
    iframe.width = width;
    iframe.height = height;

    // Determine if running locally or on a server
    const isLocal = window.location.protocol === "file:";
    const currentParent = isLocal ? "localhost" : window.location.hostname;

    iframe.src = `https://player.twitch.tv/?channel=${channel}&parent=${currentParent}`;
    iframe.frameBorder = "0";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    container.appendChild(iframe);
    return container;
  };
}

export function createAnimationGrid(
  containerWidth,
  containerHeight,
  numCols,
  numRows,
  gap
) {
  return () => {
    const container = document.createElement("div");
    container.classList.add("animated-grid-container");
    container.style.display = "grid";
    container.style.width = `${containerWidth}px`;
    container.style.height = `${containerHeight}px`;
    container.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${numRows}, 1fr)`;
    container.style.gap = `${gap}px`;

    const totalItems = numCols * numRows;

    for (let i = 0; i < numCols * numRows; i++) {
      const box = document.createElement("div");
      box.classList.add("box");
      const animationDelay = (-1 / totalItems) * i * Math.cos(i);
      box.style.animationDelay = `${animationDelay}s`;
      container.appendChild(box);
    }

    return container;
  };
}

// export function createRTSPPreset(url, width, height) {
//     const container = document.createElement("div");
//     container.classList.add("rtsp-container");

//     // Create a container for the Streamedian player
//     const videoContainer = document.createElement("div");
//     videoContainer.id = "rtsp-video-container";
//     videoContainer.style.width = `${width}px`;
//     videoContainer.style.height = `${height}px`;

//     container.appendChild(videoContainer);

//     // Initialize Streamedian player with RTSP support
//     const config = {
//       url: url, // Your RTSP stream URL
//       container: videoContainer,
//       autoplay: true,
//       webrtcConfig: {
//         iceServers: [
//           { urls: 'stun:stun.l.google.com:19302' }
//         ]
//       },
//       webrtcMediaConfig: {
//         video: { width: width, height: height }
//       }
//     };

//     new Streamedian.player(config);

//     return container;
//   }

// export function createDinoJumperGame(width, height) {
//     const container = document.createElement('div');
//     container.classList.add('game-container');

//     const gameCanvas = document.createElement('canvas');
//     gameCanvas.width = width;
//     gameCanvas.height = height;
//     container.appendChild(gameCanvas);

//     return container;
// }
