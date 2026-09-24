import {
  createNoSignalPreset,
  createInfineBouncePreset,
  createBackgroundVideoPreset,
  createRandomVideoBroadcastPreset,
  createGifPreset,
  createTwitchiFramePreset,
  createImagePreset,
} from "./tv_content_presets.js";

import { YouTubePlayer } from "./youtube_player.js";
import { MediaListeners } from "./media-listeners.js";
import { NoiseShader } from "./noise_shader.js";
import { createAnimationGridShader } from "./animation_grid_shader.js";
import { createLavaLampShader } from "./lava_lamp_shader.js";
import { BangbooJumpGame } from "./bambo_jump.js";
import { WeatherChannel } from "./weather_channel.js";
import { debounce } from "./utils.js";

export class TVContentManager {
  constructor(
    tv_screen,
    tvContentContainer,
    tvInfoOverlay,
    canvasContainer,
    crtContainer,
    wallpaperSettings
  ) {
    this.tv_screen = tv_screen;
    this.tvContentContainer = tvContentContainer;
    this.tvInfoOverlay = tvInfoOverlay;
    this.canvas_container = canvasContainer;
    this.crtContainer = crtContainer;

    this.wallpaperSettings = wallpaperSettings;

    this.mediaContentFitMode = "cover";

    this.tv_guide = {};
    this.currentInputIndex = 0;
    this.currentInputType = "";

    const boundingRect = this.tvContentContainer.getBoundingClientRect();
    this.canvas_container.width = boundingRect.width;
    this.canvas_container.height = boundingRect.height;

    const startingVideo = document.createElement("video");
    startingVideo.id = "starting-video";
    startingVideo.src = "resource/video/zzz_opening.webm";
    startingVideo.autoplay = true;
    startingVideo.muted = true;
    startingVideo.playsInline = true;
    startingVideo.onended = function () {
      startingVideo.remove();
    };

    try {
      this.initializeNoiseShader();
      this.initializeMusicPlayer();
      this.initializeWeatherChannel();
      console.log("Media listeners initialized");

      this.crtContainer.appendChild(createNoSignalPreset());
      this.crtContainer.appendChild(startingVideo);

      this.youtubePlayer = new YouTubePlayer(tvContentContainer);
      this.youtubePlayer.onErrorCallback = (code) => {
        console.warn(`YouTube player error reported: ${code}`);
        window.dispatchEvent(new CustomEvent("yt-error", { detail: { code } }));
      };
      this.videoPlayer = null;

      setTimeout(() => {
        console.log("TVContentManager initialized");
      }, 1000);

      this.isContentLoaded = false;
      this.gameCanvas = null;
    } catch (error) {
      console.error("Error initializing TVContentManager:", error);
    }
  }

  initializeNoiseShader() {
    try {
      this.noiseShader = new NoiseShader(
        this.canvas_container,
        this.wallpaperSettings
      );
      window.addEventListener("resize", () => this.noiseShader.resizeCanvas());
      this.noiseShader.animate();
    } catch (error) {
      console.error("Error initializing NoiseShader:", error);
    }
  }

  initializeMusicPlayer() {
    try {
      console.log("Initializing music player...");
      this.mediaListeners = new MediaListeners(this.wallpaperSettings);
      console.log(
        "Music player container created:",
        this.mediaListeners
      );
      this.tvContentContainer.appendChild(
        this.mediaListeners.getContainer()
      );
      this.mediaListeners.hide();
    } catch (error) {
      console.error("Error initializing MusicPlayer:", error);
    }
  }

  initializeWeatherChannel() {
    try {
      console.log("Initializing weather channel...");
      this.weatherChannel = new WeatherChannel(this.wallpaperSettings);
      console.log(
        "Weather channel initialized:",
        this.weatherChannel
      );
      this.tvContentContainer.appendChild(
        this.weatherChannel.getContainer()
      );
    } catch (error) {
      console.error("Error initializing WeatherChannel:", error);
    }
  }

  setWallpaperSettings(wallpaperSettings, updateType) {
    try {
      console.log("Updating wallpaper settings...");
      this.wallpaperSettings = wallpaperSettings;

      if (updateType.has("fps")) {
        if (this.noiseShader) {
          this.noiseShader.setWallpaperSettings(wallpaperSettings);
        }
      }
      if (updateType.has("weather")) {
        if (this.weatherChannel) {
          this.weatherChannel.setWallpaperSettings(wallpaperSettings);
        }
      }
      if (updateType.has("music")) {
        if (this.mediaListeners) {
          this.mediaListeners.setWallpaperSettings(wallpaperSettings);
        }
      }

      if (this.wallpaperSettings.object_fit) {
        this.mediaContentFitMode = this.wallpaperSettings.object_fit;
        if (this.videoPlayer) {
          this.videoPlayer.style.objectFit = this.mediaContentFitMode;
        }
        if (this.youtubePlayer) {
          this.youtubePlayer.setContentFitMode(this.mediaContentFitMode);
        }
      }
    } catch (error) {
      console.error("Error setting wallpaper settings:", error);
    }
  }

  loadPresets(userInput) {
    try {
      this.tv_guide = {};
      console.log("Loading presets with user input: ", userInput);
      const w = this.canvas_container.width;
      const h = this.canvas_container.height;

      if (typeof userInput !== "object") {
        console.error("Invalid userInput, expected an object.");
        return;
      }

      for (let type in userInput) {
        if (!userInput[type].state) {
          continue;
        }

        if (
          !Array.isArray(userInput[type].content) ||
          userInput[type].content.length === 0
        ) {
          console.log(`No ${type} channels provided.`);
          continue;
        }

        this.tv_guide[type] = {
          channels: [],
          totalChannels: 0,
          currentChannel: 0,
        };

        for (let id of userInput[type].content) {
          let presetFunction;

          if (type === "youtube") {
            console.log(`Processing YouTube ID: ${id}`);
            if (id.startsWith("LIVE_")) {
              const liveId = id.replace("LIVE_", "");
              console.log(
                `Detected live stream ID: ${id}, Processed live stream ID: ${liveId}`
              );
              presetFunction = [
                () => ({ type: "youtube", videoId: liveId, isLive: true }),
              ];
            } else if (id.length > 11) {
              presetFunction = [
                () => ({ type: "youtube", videoId: id, isPlaylist: true }),
              ];
            } else {
              presetFunction = [() => ({ type: "youtube", videoId: id })];
            }
          } else {
            switch (type) {
              case "twitch":
                presetFunction = [createTwitchiFramePreset(id, w, h)];
                break;
              case "gif":
                presetFunction = [createGifPreset(id)];
                break;
              case "image":
                presetFunction = [createImagePreset(id)];
                break;
              case "video":
                console.log(`Processing video ID: ${id}`);
                if (!id || id === "default" || id === "random") {
                  presetFunction = [
                    createRandomVideoBroadcastPreset(this.wallpaperSettings),
                  ];
                } else {
                  presetFunction = [
                    createBackgroundVideoPreset(
                      id,
                      "video/mp4",
                      false,
                      true
                    ),
                  ];
                }
                break;
              case "music":
                presetFunction = [() => ({ type: "music", style: id })];
                break;
              case "weather":
                presetFunction = [() => ({ type: "weather", style: id })];
                break;
              case "av":
                if (id === "default") {
                  presetFunction = [
                    createInfineBouncePreset("resource/image/zzz_logo.png"),
                    createAnimationGridShader(
                      w,
                      h,
                      30,
                      40,
                      10,
                      [1, 217 / 255, 0],
                      this.wallpaperSettings.fps
                    ),
                    createLavaLampShader(
                      w,
                      h,
                      null,
                      null,
                      this.wallpaperSettings.fps
                    ),
                  ];
                } else {
                  presetFunction = [];
                }
                break;
              case "game":
                presetFunction = [() => id];
                break;
              default:
                presetFunction = [];
                console.warn(`Unsupported type: ${type}`);
            }
          }

          this.tv_guide[type].channels.push(...presetFunction);
        }

        this.tv_guide[type].totalChannels =
          this.tv_guide[type].channels.length;
      }

      this.tv_input_keys = Object.keys(this.tv_guide);
      this.currentInputType = this.tv_input_keys[this.currentInputIndex] || "";
      console.log("Presets loaded: ", this.tv_guide);
    } catch (error) {
      console.error("Error loading presets:", error);
    }
  }

  stopAllMedia() {
    try {
      if (this.videoPlayer) {
        try {
          if (typeof this.videoPlayer.destroy === "function") {
            this.videoPlayer.destroy();
          } else {
            this.videoPlayer.pause();
            this.videoPlayer.muted = true;
            this.videoPlayer.removeAttribute("src");
            this.videoPlayer.load();
          }
        } catch (_) {}
        this.videoPlayer = null;
      }
      const allVideos = this.tvContentContainer.querySelectorAll("video");
      allVideos.forEach((v) => {
        try {
          if (typeof v.destroy === "function") v.destroy();
          v.pause();
          v.muted = true;
          v.removeAttribute("src");
          v.load();
          v.remove();
        } catch (_) {}
      });
      const allAudios = this.tvContentContainer.querySelectorAll("audio");
      allAudios.forEach((a) => {
        try {
          a.pause();
          a.muted = true;
          a.removeAttribute("src");
          a.load();
          a.remove();
        } catch (_) {}
      });
    } catch (e) {
      console.warn("Error in stopAllMedia:", e);
    }
  }

  switchContentProcess() {
    try {
      console.log("Starting switchContent process...");
      this.stopAllMedia();
      this.canvas_container.classList.remove("noise-switch-ani");
      void this.canvas_container.offsetWidth;
      this.canvas_container.classList.add("noise-switch-ani");
      setTimeout(async () => {
        await this.loadContent();
        console.log("Finished switchContent process.");
      }, 500);
    } catch (error) {
      console.error("Error during switchContent process:", error);
    }
  }

  nextInput() {
    try {
      this.stopAllMedia();
      const prevInputIndex = this.currentInputIndex;
      this.currentInputIndex =
        (this.currentInputIndex + 1) % this.tv_input_keys.length;

      if (prevInputIndex === this.currentInputIndex) {
        console.log("No more inputs available.");
        return false;
      }

      console.log(
        `Switching to input: ${this.tv_input_keys[this.currentInputIndex]}`
      );
      const overlayTitle = this.tv_input_keys[
        this.currentInputIndex
      ].toUpperCase();
      this.showOverlayAnimation(
        `${overlayTitle}-${
          this.tv_guide[this.tv_input_keys[this.currentInputIndex]]
            .currentChannel
        }`
      );
      this.currentInputType = this.tv_input_keys[this.currentInputIndex];
      this.switchContentProcess();
      return true;
    } catch (error) {
      console.error("Error switching to next input:", error);
      return false;
    }
  }

  nextChannel() {
    try {
      if (this.currentInputIndex >= this.tv_input_keys.length) {
        console.error("Invalid input index, resetting back to 0");
        this.currentInputIndex = 0;
      }

      if (
        this.tv_input_keys[this.currentInputIndex] !== this.currentInputType
      ) {
        console.error("Invalid input type, resetting back to 0");
        this.currentInputIndex = 0;
        this.currentInputType = this.tv_input_keys[this.currentInputIndex];
      }

      const currentPreset =
        this.tv_guide[this.tv_input_keys[this.currentInputIndex]];
      const prevChannel = currentPreset.currentChannel;
      currentPreset.currentChannel =
        (currentPreset.currentChannel + 1) % currentPreset.totalChannels;

      if (prevChannel === currentPreset.currentChannel) {
        if (this.tv_input_keys[this.currentInputIndex] === "video" && this.videoPlayer && typeof this.videoPlayer.playNextRandomVideo === "function") {
          this.showOverlayAnimation("VIDEO-0");
          this.videoPlayer.playNextRandomVideo();
          return true;
        }
        console.log("No more channels available.");
        return false;
      }

      this.stopAllMedia();

      console.log(
        `Switching to channel: ${currentPreset.currentChannel} of input: ${
          this.tv_input_keys[this.currentInputIndex]
        }`
      );
      const overlayTitle = this.tv_input_keys[
        this.currentInputIndex
      ].toUpperCase();
      this.showOverlayAnimation(
        `${overlayTitle}-${currentPreset.currentChannel}`
      );

      this.switchContentProcess();
      return true;
    } catch (error) {
      console.error("Error switching to next channel:", error);
      return false;
    }
  }

  isFirstLoad() {
    return !this.isContentLoaded;
  }

  resetTVInputAndChannels() {
    this.currentInputIndex = 0;
  }

  async loadContent() {
    console.log("Starting loadContent process...");
    try {
      await this.clearContent();

      const currentPreset =
        this.tv_guide[this.tv_input_keys[this.currentInputIndex]];
      const channelType = this.tv_input_keys[this.currentInputIndex];

      if (currentPreset.channels.length > 0) {
        const currentChannel =
          currentPreset.channels[currentPreset.currentChannel]();

        console.log("current channel: ", currentChannel);

        if (channelType === "youtube") {
          this.youtubePlayer.updateYouTubePlayer(
            currentChannel.videoId,
            currentChannel.isPlaylist,
            currentChannel.isLive
          );
          this.youtubePlayer.setContentFitMode(this.mediaContentFitMode);
        } else if (channelType === "music") {
          this.mediaListeners.show();
          this.mediaListeners.registerEventListeners();
        } else if (channelType === "weather") {
          this.weatherChannel.show();
          console.log("Weather display not implemented yet.");
        } else if (channelType === "video") {
          if (currentChannel && currentChannel.video) {
            this.videoPlayer = currentChannel.video;
            this.videoPlayer.style.objectFit = this.mediaContentFitMode;
            this.tvContentContainer.appendChild(currentChannel.container);
          } else {
            console.warn("Invalid video channel data.");
          }
        } else if (channelType === "game") {
          if (currentChannel === "bangboo_jump") {
            this.gameCanvas = new BangbooJumpGame(
              800,
              400,
              this.wallpaperSettings.fps
            );
            this.gameCanvas.showStartScreen();
            this.tvContentContainer.appendChild(this.gameCanvas.getCanvas());
          }
        } else {
          if (currentChannel) {
            currentChannel.style.objectFit = this.mediaContentFitMode;
            this.tvContentContainer.appendChild(currentChannel);
          } else {
            console.warn("Invalid channel data.");
          }
        }
      } else {
        console.warn("No channels available for the current preset.");
      }
      console.log("Finished loadContent process.");
      this.isContentLoaded = true;
    } catch (error) {
      console.error("Error loading content:", error);
    }
  }

  async playYouTubeDirect(videoId, isPlaylist = false, isLive = false, title = "YouTube Broadcast") {
    try {
      console.log(`playYouTubeDirect called for videoId: ${videoId}`);
      await this.clearContent();
      if (!this.youtubePlayer) {
        this.youtubePlayer = new YouTubePlayer(this.tvContentContainer);
        this.youtubePlayer.onErrorCallback = (code) => {
          console.warn(`YouTube player error reported: ${code}`);
          window.dispatchEvent(new CustomEvent("yt-error", { detail: { code } }));
        };
      }
      this.youtubePlayer.updateYouTubePlayer(videoId, isPlaylist, isLive);
      this.youtubePlayer.setContentFitMode(this.mediaContentFitMode);
      if (typeof this.displayOverlay === "function") {
        this.displayOverlay(`▶ ${title}`, 3500);
      }
      this.currentInputType = "youtube";
      if (Array.isArray(this.tv_input_keys)) {
        const ytIndex = this.tv_input_keys.indexOf("youtube");
        if (ytIndex !== -1) {
          this.currentInputIndex = ytIndex;
        }
      }
    } catch (err) {
      console.error("Error playing direct YouTube:", err);
    }
  }

  async clearContent() {
    console.log("Starting clearContent process...");
    try {
      this.stopAllMedia();

      const children = Array.from(this.tvContentContainer.children);

      if (children.length === 0) {
        return;
      }

      const unloadPromises = children.map((child) => {
        return new Promise((resolve) => {
          try {
            if (child.id === "youtube-container") {
              this.youtubePlayer.hideYouTubePlayer();
              child.style.display = "none";
            } else if (child.id === "music-player-container") {
              if (this.mediaListeners) {
                this.mediaListeners.hide();
                this.mediaListeners.clearEventListeners();
              }
            } else if (child.id === "weather-channel-container") {
              if (this.weatherChannel) {
                this.weatherChannel.hide();
              }
            } else {
              if (child.id === "game-canvas" && this.gameCanvas) {
                this.gameCanvas.destroy();
              }
              const vidList = child.querySelectorAll?.("video") || [];
              vidList.forEach(vid => {
                try {
                  if (typeof vid.destroy === "function") vid.destroy();
                  vid.pause();
                  vid.muted = true;
                  vid.removeAttribute("src");
                  vid.load();
                } catch (_) {}
              });
              if (child.tagName === "VIDEO") {
                try {
                  if (typeof child.destroy === "function") child.destroy();
                  child.pause();
                  child.muted = true;
                  child.removeAttribute("src");
                  child.load();
                } catch (_) {}
              } else if (child.tagName === "CANVAS") {
                const gl =
                  child.getContext("webgl") ||
                  child.getContext("experimental-webgl");
                if (gl) {
                  const extension = gl.getExtension("WEBGL_lose_context");
                  if (extension) {
                    extension.loseContext();
                  }
                }
              }

              if (child.parentNode === this.tvContentContainer) {
                this.tvContentContainer.removeChild(child);
              }
            }
            resolve();
          } catch (error) {
            console.error("Error while clearing content: ", error);
            resolve();
          }
        });
      });

      await Promise.all(unloadPromises);
      console.log("Finished clearContent process.");
    } catch (error) {
      console.error("Error during clearContent process:", error);
    }
  }

  switchPlayState() {
    try {
      const currentChannelType = this.tv_input_keys[this.currentInputIndex];
      console.log("Switching play state for input: ", currentChannelType);
      if (currentChannelType === "youtube") {
        const playerState = this.youtubePlayer.getPlayerState();
        console.log(playerState);
        if (playerState === 1) {
          this.youtubePlayer.pauseVideo();
        } else {
          this.youtubePlayer.playVideo();
        }
      } else if (currentChannelType === "video" && this.videoPlayer) {
        if (this.videoPlayer.paused) {
          this.videoPlayer.play();
          this.showOverlayAnimation("VIDEO-0 · PLAY ▶");
        } else {
          this.videoPlayer.pause();
          this.showOverlayAnimation("VIDEO-0 · PAUSE ❚❚");
        }
      }
    } catch (error) {
      console.error("Error switching play state:", error);
    }
  }

  showOverlayAnimation(text) {
    try {
      this.tvInfoOverlay.textContent = text;
      this.tvInfoOverlay.classList.remove("switch-tv-info-overlay");
      void this.tvInfoOverlay.offsetWidth;
      this.tvInfoOverlay.classList.add("switch-tv-info-overlay");
    } catch (error) {
      console.error("Error showing overlay animation:", error);
    }
  }

  async turnOn() {
    try {
      console.log("Turning on TV...");
      this.tv_screen.classList.remove("switch-tv-off");
      void this.tv_screen.offsetWidth;
      this.tv_screen.classList.add("switch-tv-on");
      await this.loadContent();
      console.log("TV is turned on and content is loaded.");
    } catch (error) {
      console.error("Error turning on TV:", error);
    }
  }

  async turnOff() {
    try {
      console.log("Turning off TV...");
      this.stopAllMedia();
      this.tv_screen.classList.remove("switch-tv-on");
      void this.tv_screen.offsetWidth;
      this.tv_screen.classList.add("switch-tv-off");
      await this.clearContent();
    } catch (error) {
      console.error("Error turning off TV:", error);
    }
  }

  getInputDict() {
    try {
      return {
        index: this.currentInputIndex,
        length: this.tv_input_keys.length,
      };
    } catch (error) {
      console.error("Error getting input dictionary:", error);
      return { index: 0, length: 0 };
    }
  }

  getChannelDict() {
    try {
      console.log(
        "Getting channel dictionary...",
        this.tv_guide[this.tv_input_keys[this.currentInputIndex]]
      );
      const currentPreset =
        this.tv_guide[this.tv_input_keys[this.currentInputIndex]];
      return {
        index: currentPreset.currentChannel,
        length: currentPreset.totalChannels,
      };
    } catch (error) {
      console.error("Error getting channel dictionary:", error);
      return { index: 0, length: 0 };
    }
  }

  setMuted(isMuted) {
    try {
      const startingVideo = document.getElementById("starting-video");
      if (startingVideo) startingVideo.muted = isMuted;
      if (this.videoPlayer) this.videoPlayer.muted = isMuted;
      const mediaList = this.tvContentContainer.querySelectorAll("video, audio");
      mediaList.forEach(m => { m.muted = isMuted; });
      if (this.youtubePlayer && typeof this.youtubePlayer.setMuted === "function") {
        this.youtubePlayer.setMuted(isMuted);
      }
    } catch (e) {
      console.warn("Error setting mute state in TVContentManager:", e);
    }
  }
}
