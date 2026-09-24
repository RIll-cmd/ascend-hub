import { Clock } from "./clock.js";
import { Calendar } from "./calendar.js";
import { TVContentManager } from "./tv.js";
import { debounce } from "./utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Document ready, initializing...");
  const {
    calendarYearMonth,
    hourTens,
    hourOnes,
    minuteTens,
    minuteOnes,
    tvInfoOverlay,
    tvContentContainer,
    tvScreen,
    crtContainer,
    noiseCanvas,
    tvSwitch,
    switchInput,
    switchChannel,
    switchPlayState,
    switchChannelStaticSound,
    switchChannelSwitchSound,
  } = getDOMElements();

  console.log("DOM elements fetched");

  let tv_dict = {
    av: { state: true, content: ["default"] },
    music: { state: true, content: ["default"] },
    weather: { state: true, content: ["default"] },
    video: { state: true, content: ["default"] },
    image: { state: true, content: [""] },
    youtube: {
      state: true,
      content: [
        "LIVE_jfKfPfyJRdk",
        "LIVE_4xDzrJKXOOY",
        "LIVE_5yx6BWlEVcY"
      ]
    },
    gif: { state: true, content: [""] },
    game: { state: true, content: ["bangboo_jump"] },
  };

  let wallpaperSettings = {
    fps: 15,
    mediaintegration: false,
    isAudioVisual: true,
    musicVisualizerStyle: "gooeyWave",
    weather_api: "FLTQSEWVR77875H6UM6P65DUF",
    weather_latitude: 14.5995,
    weather_longitude: 120.9842,
    weather_city: "Manila,PH",
    weather_unit: "metric",
    object_fit: "cover",
  };

  console.log("Wallpaper Setting:", wallpaperSettings);

  const clock = new Clock(hourTens, hourOnes, minuteTens, minuteOnes);
  clock.start();
  console.log("Clock started");

  const calendar = new Calendar(
    calendarYearMonth,
    document.getElementById("calendar-header"),
    document.getElementById("calendar-grid")
  );
  calendar.start();
  console.log("Calendar started");

  console.log("Registering event listeners...");
  console.log("Initializing MediaListeners...");

  // Initialize TV Content Manager
  const tvContentManager = new TVContentManager(
    tvScreen,
    tvContentContainer,
    tvInfoOverlay,
    noiseCanvas,
    crtContainer,
    wallpaperSettings
  );
  console.log("TVContentManager initialized");

  console.log("Loading presets... Init");
  tvContentManager.loadPresets(tv_dict); // load default presets first
  tvContentManager.loadContent(); // load default content

  let isFirstLoad = true; // Flag to track if it's the first load

  const debouncedProcessVideo = debounce(async function (properties) {
    await processMediaProperties(properties, "video", tv_dict);
  }, 5000);

  const debouncedProcessImage = debounce(async function (properties) {
    await processMediaProperties(properties, "image", tv_dict);
  }, 5000);

  const debouncedProcessGif = debounce(async function (properties) {
    await processMediaProperties(properties, "gif", tv_dict);
  }, 5000);

  const debouncedApplyChangesToManager = debounce(function (updateType) {
    console.log("Applying changes to tvContentManager...");

    if (updateType.has("tv_dict")) {
      // Load presets and apply settings to the manager
      tvContentManager.loadPresets(tv_dict);
    }
    tvContentManager.setWallpaperSettings(
      wallpaperSettings, updateType
    );

    if (tvContentManager.isFirstLoad()) {
      console.log("Loading initial content...");
      try {
        tvContentManager.loadContent();
        console.log("Initial content loaded and animation started");
      } catch (error) {
        console.error("Error during initial content loading: ", error);
      }
    }

    if (isFirstLoad) {
      isFirstLoad = false;
    }
  }, 5000); // 5-second debounce

  const applyWallpaperUserProperties = async function (properties) {
    console.log("user properties received:", properties);
    let updateType = new Set();
    if (
      properties.image_channel ||
      properties.image_url ||
      properties.image_dir
    ) {
      if (isFirstLoad) {
        await processMediaProperties(properties, "image", tv_dict);
      } else {
        debouncedProcessImage(properties);
      }
      updateType.add("tv_dict");
    }
    if (
      properties.video_channel ||
      properties.video_url ||
      properties.video_dir
    ) {
      if (isFirstLoad) {
        await processMediaProperties(properties, "video", tv_dict);
      } else {
        debouncedProcessVideo(properties);
      }
      updateType.add("tv_dict");
    }
    if (properties.gif_channel || properties.gif_url || properties.gif_dir) {
      if (isFirstLoad) {
        await processMediaProperties(properties, "gif", tv_dict);
      } else {
        debouncedProcessGif(properties);
      }
      updateType.add("tv_dict");
    }

    if (properties.object_fit) {
      wallpaperSettings.object_fit = properties.object_fit.value;
      updateType.add("music");
      updateType.add("youtube");
      updateType.add("image")
    }

    if (properties.music_visualizer_style) {
      wallpaperSettings.musicVisualizerStyle =
        properties.music_visualizer_style.value;
      updateType.add("music");
    }

    if (properties.youtube_channel) {
      tv_dict.youtube.state = properties.youtube_channel.value;
      updateType.add("tv_dict");
    }
    if (properties.youtube_url) {
      tv_dict.youtube.content = splitCSVStr(properties.youtube_url.value);
      updateType.add("tv_dict");
    }

    if (properties.game_channel) {
      tv_dict.game.state = properties.game_channel.value;
      updateType.add("tv_dict");
    }

    if (properties.weather_channel) {
      tv_dict.weather.state = properties.weather_channel.value;
      updateType.add("tv_dict");
    }

    if (properties.weather_api) {
      wallpaperSettings.weather_api = properties.weather_api.value;
      updateType.add("weather");
    }

    if (properties.weatherunit) {
      wallpaperSettings.weather_unit = properties.weatherunit.value;
      updateType.add("weather");
    }

    if (properties.weather_latitude) {
      wallpaperSettings.weather_latitude = properties.weather_latitude.value;
      updateType.add("weather");
    }
    if (properties.weather_longitude) {
      wallpaperSettings.weather_longitude = properties.weather_longitude.value;
      updateType.add("weather");
    }

    // Debounce the final application to tvContentManager
    debouncedApplyChangesToManager(updateType); // Debounced application to manager
  };

  if (window.wallpaperRegisterMediaPropertiesListener) {
    window.wallpaperPropertyListener = {
      applyGeneralProperties: function (properties) {
        console.log("General properties received:", properties);
        let updateType = new Set();
        if (properties.fps) {
          wallpaperSettings.fps = properties.fps;
          updateType.add("fps");
        }
        if (properties.mediaintegration != undefined) {
          console.log(
            "Media integration changed:",
            properties.mediaintegration
          );
          wallpaperSettings.mediaintegration = properties.mediaintegration;
          updateType.add("music");
        }
        tvContentManager.setWallpaperSettings(wallpaperSettings);
      },
      applyUserProperties: applyWallpaperUserProperties,
    };
  } else {
    tv_dict = {
      av: { state: true, content: ["default"] },
      music: { state: true, content: ["default"] },
      weather: { state: true, content: ["default"] },
      video: {
        state: true,
        content: ["default"],
      },
      image: { state: true, content: [""] },
      youtube: { state: true, content: ["dC8EaBIyXK4"] },
      gif: {
        state: true,
        content: [
          "https://fastcdn.hoyoverse.com/mi18n/nap_global/m03111446031031/upload/fbced05af4f87a50f17c1a42e26adaa8_6939632208878191557.gif",
        ],
      },
      game: { state: true, content: ["bangboo_jump"] },
    };

    console.log("Loading presets...");
    tvContentManager.loadPresets(tv_dict);

    if ((tv_dict.weather.state = true)) {
      tvContentManager;
    }
  }

  console.log("tv dictionary initialized:", tv_dict);

  initializeEventListeners(
    tvContentManager,
    tvSwitch,
    switchInput,
    switchChannel,
    switchPlayState,
    switchChannelStaticSound,
    switchChannelSwitchSound
  );

  // Parent Ascend OS postMessage listener for sound toggle & control
  window.addEventListener("message", (event) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.type === "SET_MUTE") {
      const isMuted = Boolean(event.data.muted);
      if (switchChannelStaticSound) switchChannelStaticSound.muted = isMuted;
      if (switchChannelSwitchSound) switchChannelSwitchSound.muted = isMuted;
      const allMedia = document.querySelectorAll("audio, video");
      allMedia.forEach((el) => {
        el.muted = isMuted;
      });
      if (tvContentManager && typeof tvContentManager.setMuted === "function") {
        tvContentManager.setMuted(isMuted);
      }
    } else if (event.data.type === "PLAY_YOUTUBE") {
      const { videoId, isPlaylist, isLive, title } = event.data;
      if (videoId && tvContentManager) {
        tvContentManager.playYouTubeDirect(videoId, Boolean(isPlaylist), Boolean(isLive), title);
      }
    } else if (event.data.type === "PAUSE_YOUTUBE") {
      if (tvContentManager?.youtubePlayer) {
        tvContentManager.youtubePlayer.pauseVideo();
      }
    } else if (event.data.type === "RESUME_YOUTUBE") {
      if (tvContentManager?.youtubePlayer) {
        tvContentManager.youtubePlayer.playVideo();
      }
    }
  });
});

function getDOMElements() {
  console.log("Fetching DOM elements...");
  return {
    calendarYearMonth: document.getElementById("calendar-year-month"),
    hourTens: document.getElementById("hour-tens"),
    hourOnes: document.getElementById("hour-ones"),
    minuteTens: document.getElementById("minute-tens"),
    minuteOnes: document.getElementById("minute-ones"),
    tvInfoOverlay: document.getElementById("tv-info-overlay"),
    tvContentContainer: document.getElementById("tv-content-container"),
    tvScreen: document.getElementById("tv-screen-id"),
    crtContainer: document.getElementById("crt-container"),
    noiseCanvas: document.getElementById("noise-canvas"),
    tvSwitch: document.getElementById("tv-switch"),
    switchInput: document.getElementById("switch-input"),
    switchChannel: document.getElementById("switch-channel"),
    switchPlayState: document.getElementById("switch-play-state"),
    switchChannelStaticSound: document.getElementById("switch-channel-static"),
    switchChannelSwitchSound: document.getElementById("switch-channel-switch"),
    // switchChannelStaticSound = document.getElementById('switch-channel-');
  };
}

function initializeEventListeners(
  tvContentManager,
  tvSwitch,
  switchInput,
  switchChannel,
  switchPlayState,
  switchChannelStaticSound,
  switchChannelSwitchSound
) {
  console.log("Setting up event listeners...");

  const turnAngle = 180;
  const cooldownTime = 800;

  function updateDial() {
    const inputAngle =
      (turnAngle * tvContentManager.getInputDict().index) /
      tvContentManager.getInputDict().length;
    switchInput.style.transform = `rotateZ(-${inputAngle}deg)`;
    const channelAngle =
      (turnAngle * tvContentManager.getChannelDict().index) /
      tvContentManager.getChannelDict().length;
    switchChannel.style.transform = `rotateZ(-${channelAngle}deg)`;
  }

  // Utility function to handle cooldown
  function handleCooldown(element) {
    element.disabled = true;
    setTimeout(() => {
      element.disabled = false;
    }, cooldownTime);
  }

  tvSwitch.addEventListener("change", (event) => {
    if (event.target.checked) {
      tvContentManager.turnOn();
      switchChannelSwitchSound.play();
    } else {
      tvContentManager.turnOff();
      switchChannelSwitchSound.play();
      // console.log("Checkbox is unchecked");
    }

    handleCooldown(tvSwitch); // Apply cooldown to tvSwitch
  });

  switchInput.addEventListener("click", () => {
    const isChanged = tvContentManager.nextInput();
    if (isChanged) {
      // switchChannelStaticSound.play();
      updateDial();
    }

    handleCooldown(switchInput); // Apply cooldown to switchInput
  });

  switchChannel.addEventListener("click", () => {
    const isChanged = tvContentManager.nextChannel();
    if (isChanged) {
      // switchChannelStaticSound.play();
      updateDial();
    }

    handleCooldown(switchChannel); // Apply cooldown to switchChannel
  });

  switchPlayState.addEventListener("click", () => {
    tvContentManager.switchPlayState();

    handleCooldown(switchPlayState); // Apply cooldown to switchPlayState
  });
}

function splitCSVStr(csvStr) {
  return csvStr.split(",").map((item) => item.trim());
}
function isValidURL(str) {
  try {
    new URL(str);
    return true;
  } catch (e) {
    return false;
  }
}

async function processMediaProperties(properties, type, tv_dict) {
  console.log(`Processing ${type} properties...`);
  if (properties[`${type}_channel`]) {
    tv_dict[type].state = properties[`${type}_channel`].value;
  }

  if (!tv_dict[type].state) {
    console.log(`Skipping ${type} as it's disabled.`);
    return;
  }

  let array = [];
  let set = new Set();

  // Process URLs and check for validity
  if (properties[`${type}_url`] && properties[`${type}_url`].value) {
    const urls = splitCSVStr(properties[`${type}_url`].value);
    const validUrls = urls.filter(isValidURL);
    array = array.concat(validUrls);
  }

  // Fetch random files in parallel with retries
  if (properties[`${type}_dir`] && properties[`${type}_dir`].value) {
    console.log(`Fetching random files for ${type} from directory...`);

    const filePromises = Array.from({ length: 10 }, () =>
      retryRequestRandomFileWithTimeout(`${type}_dir`, 3)
    ); // Retry 3 times
    console.log(`Total files fetched:`, filePromises.length);
    try {
      const results = await Promise.allSettled(filePromises);
      console.log(`Successfully fetched ${type} files:`);
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          set.add(result.value);
        } else {
          console.error(`Failed to fetch ${type} file:`, result.reason);
        }
      });
    } catch (error) {
      console.error(`Error during file fetching for ${type}:`, error);
    }
  }

  // If valid files are found, add them to array
  if (set.size > 0) {
    array = array.concat(Array.from(set));
  }

  // Only update content if there's something in array
  if (array.length > 0) {
    tv_dict[type].content = array;
  }

  console.log(`Updated ${type} content:`, tv_dict[type].content);
}

function retryRequestRandomFileWithTimeout(
  propertyName,
  retries = 3,
  timeoutDuration = 5000
) {
  return new Promise((resolve, reject) => {
    function attemptFetch(remainingRetries) {
      // Timeout to prevent hanging
      const timeout = setTimeout(() => {
        if (remainingRetries > 0) {
          console.log(
            `Retrying to fetch file for ${propertyName} after timeout (${remainingRetries} retries left)`
          );
          attemptFetch(remainingRetries - 1);
        } else {
          reject(
            new Error(
              `Request timed out and failed after retries: ${propertyName}`
            )
          );
        }
      }, timeoutDuration);

      window.wallpaperRequestRandomFileForProperty(
        propertyName,
        (property, filePath) => {
          clearTimeout(timeout); // Clear timeout if request is successful
          if (filePath) {
            resolve(`file:///${filePath}`);
          } else if (remainingRetries > 0) {
            console.log(
              `Retrying to fetch file for ${propertyName} (${remainingRetries} retries left)`
            );
            attemptFetch(remainingRetries - 1); // Retry
          } else {
            reject(
              new Error(`Failed to fetch file after retries: ${propertyName}`)
            );
          }
        }
      );
    }

    attemptFetch(retries);
  });
}
