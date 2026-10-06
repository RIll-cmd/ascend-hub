export class YouTubePlayer {
  constructor(tvContentContainer) {
    this.tvContentContainer = tvContentContainer;
    this.youtubePlayer = null;
    this.youtubePlayerReady = false;
    this.onErrorCallback = null;
    this.pendingSelection = null;
    this.currentSelection = null;
    this.apiFailed = false;

    this.initializeYouTubePlayer();
  }

  initializeYouTubePlayer() {
    this.youtubeContainer = document.createElement("div");
    this.youtubeContainer.classList.add("youtube-container");
    this.youtubeContainer.id = "youtube-container";
    this.youtubeContainer.style.display = "none"; // Initially hidden
    this.tvContentContainer.appendChild(this.youtubeContainer);

    const playerDiv = document.createElement("div");
    playerDiv.id = "youtube-player";
    this.youtubeContainer.appendChild(playerDiv);

    // Use a Promise to handle the API readiness
    this.loadYouTubeAPI().then(() => {
      this.initYouTubePlayer();
    }).catch((error) => {
      console.error("Error loading YouTube IFrame API:", error);
      this.apiFailed = true;
      this.onErrorCallback?.("api-unavailable");
    });
  }

  loadYouTubeAPI() {
    return new Promise((resolve, reject) => {
      if (window.YT?.Player) return resolve();
      let tag = document.getElementById("youtube-iframe-api");
      if (!tag) {
        tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.id = "youtube-iframe-api";
        document.head.appendChild(tag);
      }
      const clean = () => { clearInterval(interval); clearTimeout(timeout); tag.removeEventListener("error", failed); };
      const failed = () => { clean(); tag.remove(); reject(new Error("YouTube API unavailable")); };
      const interval = setInterval(() => { if (window.YT?.Player) { clean(); resolve(); } }, 100);
      const timeout = setTimeout(failed, 10000);
      tag.addEventListener("error", failed);
    });
  }

  retryConnection() {
    if (!this.apiFailed) return;
    this.apiFailed = false;
    this.loadYouTubeAPI().then(() => this.initYouTubePlayer()).catch(() => {
      this.apiFailed = true;
      this.onErrorCallback?.("api-unavailable");
    });
  }

  initYouTubePlayer() {
    try {
      this.youtubePlayer = new YT.Player("youtube-player", {
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          loop: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            this.youtubePlayerReady = true;
            if (this.pendingSelection) {
              const selection = this.pendingSelection;
              this.pendingSelection = null;
              this.updateYouTubePlayer(selection.videoId, selection.isPlaylist, selection.isLive);
            }
            console.log("YouTube player ready");
          },
          onStateChange: (event) => {
            console.log(`YouTube player state change: ${event.data}`);
            if (event.data === YT.PlayerState.PLAYING) window.dispatchEvent(new CustomEvent("yt-playing"));
            if (event.data === YT.PlayerState.ENDED) {
              event.target.playVideo(); // Loop the video
            }
          },
          onError: (event) => {
            console.error(`YouTube player error: ${event.data}`, event);
            // Handle specific error codes
            switch (event.data) {
              case 2:
                console.error("Invalid parameter in request.");
                break;
              case 5:
                console.error("The requested content cannot be played in an HTML5 player.");
                break;
              case 100:
                console.error("Video not found or removed.");
                break;
              case 101:
              case 150:
                console.error(
                  "Video playback not allowed by the video owner."
                );
                break;
              default:
                console.error("An unknown error occurred.");
            }
            // Additional error handling or fallback can be added here
            if (typeof this.onErrorCallback === "function") {
              try {
                this.onErrorCallback(event.data);
              } catch (cbErr) {
                console.error("Error in onErrorCallback:", cbErr);
              }
            }
          },
        },
      });
    } catch (error) {
      console.error("Error initializing YouTube player:", error);
      this.apiFailed = true;
      this.onErrorCallback?.("api-unavailable");
    }
  }

  updateYouTubePlayer(videoId, isPlaylist = false, isLive = false) {
    this.currentSelection = { videoId, isPlaylist, isLive };
    if (!this.youtubePlayerReady) {
      this.pendingSelection = this.currentSelection;
      if (this.apiFailed) this.onErrorCallback?.("api-unavailable");
      return;
    }

    this.youtubeContainer.style.display = "block"; // Show the YouTube container

    try {
      const currentVideoData = this.youtubePlayer.getVideoData();
      const currentVideoId = currentVideoData.video_id || "";
      const currentPlaylistId = currentVideoData.list || "";

      console.log(
        `Current video ID: ${currentVideoId}, New video ID: ${videoId}`
      );

      if (isPlaylist) {
        if (currentPlaylistId === videoId) {
          console.log(
            "The same playlist is already playing, no need to reload."
          );
          this.youtubePlayer.playVideo(); // Resume playing if the playlist is the same
        } else {
          this.youtubePlayer.loadPlaylist({
            listType: "playlist",
            list: videoId,
            index: 0,
            startSeconds: 0,
            suggestedQuality: "default",
          });
        }
      } else if (isLive) {
        if (currentVideoId === videoId) {
          console.log(
            "The same live video is already playing, no need to reload."
          );
          this.youtubePlayer.playVideo(); // Resume playing if the live video is the same
        } else {
          this.youtubePlayer.loadVideoById({ videoId });
        }
      } else if (currentVideoId === videoId) {
        console.log("The same video is already playing, no need to reload.");
        this.youtubePlayer.playVideo(); // Resume playing if the video is the same
      } else {
        this.youtubePlayer.loadVideoById({ videoId });
      }
    } catch (error) {
      console.error("Error updating YouTube player:", error);
    }
  }

  setContentFitMode(mode) {
    if (mode === "cover") {
      this.youtubeContainer.style.left = "-15%";
      this.youtubeContainer.style.width = "130%";
    } else {
      this.youtubeContainer.style.left = "0";
      this.youtubeContainer.style.width = "100%";
    }
  }

  hideYouTubePlayer() {
    if (this.youtubeContainer) {
      this.youtubeContainer.style.display = "none"; // Hide the YouTube container
    }
    if (this.youtubePlayerReady && this.youtubePlayer) {
      console.log("Pausing YouTube player");
      try {
        this.youtubePlayer.pauseVideo();
      } catch (error) {
        console.error("Error pausing YouTube player:", error);
      }
    }
  }

  getPlayerState() {
    if (this.youtubePlayer) {
      try {
        return this.youtubePlayer.getPlayerState();
      } catch (error) {
        console.error("Error getting player state:", error);
        return -1;
      }
    }
    return -1; // Player state is not available
  }

  playVideo() {
    if (this.youtubePlayer) {
      try {
        this.youtubePlayer.playVideo();
      } catch (error) {
        console.error("Error playing video:", error);
      }
    }
  }

  pauseVideo() {
    if (this.youtubePlayer) {
      try {
        this.youtubePlayer.pauseVideo();
      } catch (error) {
        console.error("Error pausing video:", error);
      }
    }
  }

  setMuted(isMuted) {
    if (this.youtubePlayer && this.youtubePlayerReady) {
      try {
        if (isMuted) {
          this.youtubePlayer.mute();
        } else {
          this.youtubePlayer.unMute();
        }
      } catch (e) {
        console.warn("Error toggling YouTube mute:", e);
      }
    }
  }
}
