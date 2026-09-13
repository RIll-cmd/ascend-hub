import { fetchSVGIcon, debounce } from "./utils.js";

import {
  radialBarsVisualizer,
  radialBarsVisualizer2,
  waveformVisualizer,
  waveformStackedVisualizer,
  inverseWaveformVisualizer,
  inverseSmoothWaveformVisualizer,
  particleBurstVisualizer,
  spectrumRingsVisualizer,
  lissajousCurveVisualizer,
  circularWaveVisualizer,
  roundedBarVisualizer,
  mirrorDotBarVisualizer,
  gooeyVisualizer,
  circularPulseVisualizer,
  gooeyWaveVisualizer,
  waterPuddleVisualizer,
  dotJumpVisualizer,
} from "./music_visualizer.js";

export class MediaListeners {
  constructor(wallpaperSettings) {
    this.container = this.createMusicPlayerPreset()();

    this.wallpaperSettings = wallpaperSettings;
    this.setWallpaperSettingsDebounce = debounce(
      this.setWallpaperSettings.bind(this),
      1000
    );
    // this.setWallpaperSettings(wallpaperSettings);

    this.isPlaying = false; // playing or paused
    // this.updateReferences();
    this.lastUpdateTime = performance.now();
    this.accurateCurrentTime = 0;
    this.animationFrameId = null;
    this.apiRecallTime = 0;

    this.artistScrollTimeout = null;
    this.trackTitleScrollTimeout = null;

    this.visualizerStyle = "radialBars";

    this.videoStreamingServiceMap = {
      "Disney+": {
        imagePath: "resource/brand/disney_plus.png",
        primaryColor: "#006f7e",
        textColor: "#006f7e",
        outlineColor: "#e9edf3",
      },
      Paramount: {
        imagePath: "resource/brand/paramount.jpg",
        primaryColor: "#066df8",
        textColor: "#066df8",
        outlineColor: "#ffffff",
      },
      Hulu: {
        imagePath: "resource/brand/hulu.png",
        primaryColor: "#1ce783",
        textColor: "#1ce783",
        outlineColor: "#040405",
      },
      Netflix: {
        imagePath: "resource/brand/netflix.jpg",
        primaryColor: "#E50914",
        textColor: "#E50914",
        outlineColor: "#161616",
      },
      "Prime Video": {
        imagePath: "resource/brand/prime_video.png",
        primaryColor: "#2094ee",
        textColor: "#2094ee",
        outlineColor: "#000000",
      },
      "Apple TV": {
        imagePath: "resource/brand/apple_tv.jpg",
        primaryColor: "#ffffff",
        textColor: "#ffffff",
        outlineColor: "#000000",
      },
      Twitch: {
        imagePath: "resource/brand/twitch.webp",
        primaryColor: "#9047FF",
        textColor: "#ffffff",
        outlineColor: "#000000",
      },
    };

    this.artistName = "";
    this.trackName = "";

    this.artistTextColor = "";
    this.artistBackgroundColor = "";
    this.artistBorderColor = "";
    this.timeInfoTextColor = "";
    this.timeInfoTextBorderColor = "";

    //"#101010", "#a6ff00", "#101010", "#a6ff00", "#101010"
    //updateBackgroundColorPalette(artistTextColor, artistBackgroundColor, artistBorderColor, timeInfoTextColor, timeInfoTextBorderColor)
    this.albumCoverArtImage = "resource/image/unknow_faction_bg.png";
    this.thumbnailColorSet = {
      artistTextColor: "#101010",
      artistBackgroundColor: "#a6ff00",
      artistBorderColor: "#101010",
      timeInfoTextColor: "#a6ff00",
      timeInfoTextBorderColor: "#101010",
    };

    this.checkMediaIntegration();

    // Set up global error handling
    window.addEventListener("error", this.handleGlobalError.bind(this));

    setTimeout(() => {
      this.registerEventListeners();
    }, 5000);
  }

  getRandomAritsitNickname(artistNameOri) {
    const artistName = artistNameOri.toLowerCase();
    // The nickname object
    const artistNickname = {
      pewdiepie: ["Gloria Borger", "Pewds", "BeasetMaster 64"],
      ksi: ["JJ", "Bandana Warrior"],
      markiplier: ["Markimoo", "Masochist"],
      penguinz0: ["Jesus", "YouTube Jesus", "Hunger Games Actor"],
      jacksepticeye: ["Potato Man", "Irish Potato"],
      jackfilms: ["YIAY Host", "Content Warrior"],
      "jaiden animations": ["Bird Mom"],
      ijustine: ["Apple Sponsor"],
      h3h3productions: ["Vape Nation"],
      "asmongold tv": ["Exclusive WoW Content Creator"],
      "snoop dogg": "SNOOP LION",
      "basically homeless": "Virus Guy",
      oddsoneout: "Furry Marshmellow",
      caddicarus: ["Caddi", "British man who loves Crash Bandicoot"],
      sssniperwolf: ["Youtube's Golden Girl"],
      "marques brownlee": ["A Tech Reviewer"],
      "steven he": ["Asian", "Asian Guy"],
      mrnigelng: [
        "Uncle Roger",
        "Orange Polo Asian",
        "Egg Fried Rice Ambassador",
      ],
      "pirate software": [
        "Heartbound Game Dev",
        "Ex Blizzard / Ex Amazon",
        "Thor",
        "The offspring of the unstoppable WoW player from South Park’s 'Make Love, Not Warcraft' episode",
      ],
    };

    // Check if the artist exists in the object
    if (artistNickname[artistName]) {
      const nicknames = artistNickname[artistName];

      // If it's an array, pick a random one
      if (Array.isArray(nicknames)) {
        const randomIndex = Math.floor(Math.random() * nicknames.length);
        return nicknames[randomIndex];
      }
      // If it's just a string, return the string (for cases like "snoop dogg")
      else {
        return nicknames;
      }
    }

    // Return the original name if no nickname is found
    return artistNameOri;
  }

  handleGlobalError(event) {
    console.error("Global error detected:", event.message);
    // this.registerEventListeners();
  }
  createMusicPlayerPreset() {
    return () => {
      const container = document.createElement("div");
      container.classList.add("music-player");
      container.id = "music-player-container";

      const vinylRecordContainer = document.createElement("div");
      vinylRecordContainer.id = "vinyl-record-container";

      const vinylRecordImg = document.createElement("img");
      vinylRecordImg.id = "vinyl-record-img";
      vinylRecordImg.src = "resource/image/record_with_highlight.png";
      vinylRecordImg.classList.add("vinyl-recrod");
      // vinylRecordImg.classList.add("spin-360")

      const vinylPlayIcon = document.createElement("div");
      vinylPlayIcon.id = "vinyl-play-icon";
      fetchSVGIcon("resource/svg/circle-play.svg", vinylPlayIcon);

      const vinylPauseIcon = document.createElement("div");
      vinylPauseIcon.id = "vinyl-pause-icon";
      fetchSVGIcon("resource/svg/circle-pause.svg", vinylPauseIcon);

      const vinylStopIcon = document.createElement("div");
      vinylStopIcon.id = "vinyl-stop-icon";
      fetchSVGIcon("resource/svg/circle-stop.svg", vinylStopIcon);

      vinylRecordContainer.append(
        vinylRecordImg,
        vinylPlayIcon,
        vinylPauseIcon,
        vinylStopIcon
      );

      this.vinylPlayIcon = vinylPlayIcon;
      this.vinylPauseIcon = vinylPauseIcon;
      this.vinylStopIcon = vinylStopIcon;

      /// album cover art container
      const albumCoverContainer = document.createElement("div");
      albumCoverContainer.id = "album-cover-container";

      const visualizerWaveCanvas = document.createElement("canvas");
      visualizerWaveCanvas.id = "visualizer-wave-canvas";
      visualizerWaveCanvas.width = 400;
      visualizerWaveCanvas.height = 300;

      const visualizerLogoCanvas = document.createElement("canvas");
      visualizerLogoCanvas.id = "visualizer-logo-canvas";
      visualizerLogoCanvas.width = 400;
      visualizerLogoCanvas.height = 400;

      // visualizerLogoCanvas.classList.add("spin-360")

      // const stripeBackground = document.createElement("img");
      // stripeBackground.id = "stripe-background";
      // stripeBackground.src = "resource/image/stripe_background.png";

      // const zzzLogo = document.createElement("img");
      // zzzLogo.id = "zzz-logo";
      // zzzLogo.src = "resource/image/zzz_logo_white_out.png";

      const albumCoverArt = document.createElement("img");
      albumCoverArt.id = "albumCoverArt";
      albumCoverArt.style.backgroundImage =
        "url('resource/image/unknow_faction_bg.png')";
      // albumCoverArt.src = "resource/image/unknow_faction.png";

      const nothingBackground = document.createElement("img");
      nothingBackground.id = "nothing-background";
      // nothingBackground.src = "resource/image/unknow_faction_bg.png";

      // const blackMuiscPlayerBar = document.createElement("div");
      // blackMuiscPlayerBar.id = "black-music-player-bar";

      // const musicPlayerText = document.createElement("span");
      // musicPlayerText.id = "music-player-text";
      // musicPlayerText.textContent = "MUSIC PLAYER";

      albumCoverContainer.append(
        albumCoverArt,
        // blackMuiscPlayerBar,
        // zzzLogo,
        // musicPlayerText,
        nothingBackground,
        // stripeBackground,
        visualizerWaveCanvas,
        visualizerLogoCanvas
      );

      const musicPlayerBackground = document.createElement("div");
      musicPlayerBackground.id = "music-player-background";

      // Create the SVG element
      // const svg_title_bg = document.createElementNS(
      //   "http://www.w3.org/2000/svg",
      //   "svg"
      // );
      // svg_title_bg.setAttribute("class", "background-svg");
      // // svg_title_bg.setAttribute('viewBox', '0 0 0.2064 0.0234');
      // // svg_title_bg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
      // // svg_title_bg.setAttribute('fill', 'none');
      // // svg_title_bg.setAttribute('width', '1');
      // // svg_title_bg.setAttribute('height', '0.1666666');
      // svg_title_bg.id = "svg-title-bg";

      // const defs = document.createElementNS(
      //   "http://www.w3.org/2000/svg",
      //   "defs"
      // );
      // const clipPath = document.createElementNS(
      //   "http://www.w3.org/2000/svg",
      //   "clipPath"
      // );
      // clipPath.setAttribute("id", "clipPath");
      // clipPath.setAttribute("clipPathUnits", "objectBoundingBox");

      // const path = document.createElementNS(
      //   "http://www.w3.org/2000/svg",
      //   "path"
      // );
      // // path.setAttribute('d', 'M2063 1V233C1407.17 232.333 86 232.5 61.5 232.5C31 232.5 4.50003 201.5 1.50002 174.5C-0.833326 153.5 5.00001 136.5 10.5 128.5L119 1H2063Z');
      // path.setAttribute(
      //   "d",
      //   "M1 0V0.112512C0.681947 0.112189 0.0412352 0.11227 0.0293536 0.11227C0.0145624 0.11227 0.00171097 0.0972357 0.000256082 0.0841416C-0.000875496 0.0739573 0.00195344 0.0657129 0.00462072 0.0618332L0.0572388 0H1Z"
      // );

      // clipPath.appendChild(path);
      // defs.appendChild(clipPath);
      // svg_title_bg.appendChild(defs);

      // // Append the SVG to the container
      // const svgContainer = document.createElement("div");
      // svgContainer.classList.add("svg-container");
      // svgContainer.appendChild(svg_title_bg);

      const mediaTitleContainer = document.createElement("div");
      mediaTitleContainer.id = "media-title-container";

      const mediaArtistContainer = document.createElement("div");
      mediaArtistContainer.id = "media-artist-container";

      // Create the clipped div
      const progressContainer = document.createElement("div");
      progressContainer.id = "progress-container";

      const progressBg = document.createElement("div");
      progressBg.id = "progress-background";

      const progressBar = document.createElement("div");
      progressBar.id = "progress-bar";

      progressContainer.appendChild(progressBar);
      // progressContainer.appendChild(progressBg);
      // svgContainer.appendChild(progressContainer);

      // const textBox = document.createElement("div");
      // textBox.classList.add("textBox");

      const trackTitle = document.createElement("div");
      trackTitle.id = "trackTitle";
      // trackTitle.classList.add("text");
      trackTitle.textContent = "Nothing Playing";

      const artist = document.createElement("div");
      artist.id = "artist";
      // artist.classList.add("text");
      artist.textContent = "-";

      const timeInfo = document.createElement("div");
      timeInfo.id = "time-info";

      const currentTime = document.createElement("div");
      currentTime.id = "current-time";
      currentTime.textContent = "0:00";

      const timeDivider = document.createElement("div");
      timeDivider.id = "time-divider";
      timeDivider.textContent = " / ";

      const totalTime = document.createElement("div");
      totalTime.id = "total-time";
      totalTime.textContent = "0:00";

      timeInfo.append(currentTime, timeDivider, totalTime);

      mediaTitleContainer.append(trackTitle);
      mediaArtistContainer.append(artist);
      // textBox.append(trackTitle, artist, timeInfo);

      const musicPlayerMsg = document.createElement("div");
      musicPlayerMsg.id = "music-player-popup-msg";
      musicPlayerMsg.innerHTML =
        "Media Integration Not Enabled, Please Enable It In Your Wallpaper Engine Settings. <br>Settings -> General -> Windows -> Media Integration Support";

      container.append(
        vinylRecordContainer,
        musicPlayerBackground,
        albumCoverContainer,
        progressContainer,
        // textBox,
        mediaTitleContainer,
        mediaArtistContainer,
        // svgContainer,
        timeInfo,
        musicPlayerMsg
      );

      this.albumCoverArt = albumCoverArt;
      this.colorControlBackground = musicPlayerBackground;
      this.trackTitle = trackTitle;
      this.artist = artist;
      this.mediaArtistContainer = mediaArtistContainer;
      this.mediaTitleContainer = mediaTitleContainer;
      this.progressBar = progressBar;
      this.timeInfo = timeInfo;
      this.currentTimeDisplay = currentTime;
      this.timeDivider = timeDivider;
      this.totalTimeDisplay = totalTime;
      this.nothingBackground = nothingBackground;
      this.warningMessageContainer = musicPlayerMsg;

      this.vinylRecordImg = vinylRecordImg;

      this.visualizerWaveCanvas = visualizerWaveCanvas;
      this.visualizerLogoCanvas = visualizerLogoCanvas;

      this.audioWaveCanvasCtx = this.visualizerWaveCanvas.getContext("2d");
      this.audioLogoCanvasCtx = this.visualizerLogoCanvas.getContext("2d");

      this.visualizerImage = new Image();
      this.visualizerImage.src = "resource/image/logo_style.png";
      // this.visualizerImage.onload = () => {
      //   console.log("Image loaded");
      //   this.animateAudioArray(Array(4).fill(0));
      // };

      return container;
    };
  }

  setWallpaperSettings(wallpaperSettings) {
    this.wallpaperSettings = wallpaperSettings; // Update wallpaper settings here
    if (this.wallpaperSettings.musicVisualizerStyle) {
      this.visualizerStyle = this.wallpaperSettings.musicVisualizerStyle;
    }
    this.checkMediaIntegration(); // Check if media integration is enabled
  }

  getContainer() {
    return this.container;
  }

  show() {
    this.container.style.display = "block";
  }
  hide() {
    this.container.style.display = "none";
  }

  checkMediaIntegration() {
    console.log(
      "Checking media integration...",
      this.wallpaperSettings.mediaintegration
    );
    if (this.wallpaperSettings.mediaintegration) {
      this.warningMessageContainer.style.display = "none";
    } else {
      this.warningMessageContainer.style.display = "block";
    }
  }

  formatTime(seconds) {
    let hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    // const formattedHours = hours > 0 ? `${hours}:` : '';
    // const formattedMinutes = hours > 0 ? minutes.toString().padStart(2, '0') : minutes;
    const formattedSeconds = remainingSeconds.toString().padStart(2, "0");
    if (hours <= 0) {
      hours = "";
    } else {
      hours = `${hours}:`;
    }
    return `${hours}${minutes}:${formattedSeconds}`;
  }

  updateTimeline() {
    const now = performance.now();
    const elapsed = now - this.lastUpdateTime;

    let interval = 1000 / 30;
    if (this.wallpaperSettings.fps > 0) {
      interval = 1000 / this.wallpaperSettings.fps;
    }

    if (elapsed >= interval) {
      const deltaTime = elapsed / 1000;
      this.accurateCurrentTime += deltaTime;
      this.lastUpdateTime = now;

      this.updateTimelineInfo();
    }

    // Continue the animation loop
    this.animationFrameId = requestAnimationFrame(
      this.updateTimeline.bind(this)
    );
  }

  updateTimelineInfo() {
    // const progressMaxWidth = 93.5;
    const progressMaxWidth = 100;
    let barWidth =
      (this.accurateCurrentTime / this.totalDuration) * progressMaxWidth;
    barWidth = Math.min(barWidth, progressMaxWidth);
    this.progressBar.style.width = `${barWidth}%`;
    this.currentTimeDisplay.textContent = `${this.formatTime(
      this.accurateCurrentTime
    )}`;
    this.totalTimeDisplay.textContent = `${this.formatTime(
      this.totalDuration
    )}`;
  }

  startUpdateLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.lastUpdateTime = performance.now();
    this.animationFrameId = requestAnimationFrame(
      this.updateTimeline.bind(this)
    );
  }

  stopUpdateLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  drawCircle(ctx, x, y, radius, fill, stroke, strokeWidth) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  wallpaperAudioListener(audioArray) {
    if (!this.isPlaying) {
      return;
    }

    this.switchVisualizer(audioArray);
  }

  clearVisualizer() {
    if (!this.audioWaveCanvasCtx) return;
    this.audioWaveCanvasCtx.clearRect(
      0,
      0,
      this.visualizerWaveCanvas.width,
      this.visualizerWaveCanvas.height
    );
  }

  setStopScreen() {
    clearTimeout(this.updateMusicInfoTimeout);
    this.StopScreenTimer = setTimeout(() => {
      // this.albumCoverArt.classList.remove("fadeInOpacity");
      // this.albumCoverArt.classList.add("fadeOutOpacity");
      // this.albumCoverArt.style.backgroundImage = `url(resources)`;
      this.progressBar.style.width = `100%`;
      this.currentTimeDisplay.textContent = "00:00";
      this.totalTimeDisplay.textContent = "00:00";
      this.updateBackgroundColorPalette(
        "#101010",
        "#a6ff00",
        "#101010",
        "#a6ff00",
        "#101010"
      );
      this.transitionInfoHub("-", "Nothing Playing");
      this.clearVisualizer();
      // this.animateAudioArray(Array(4).fill(0));
    }, 5000);
  }

  setCanvasStyle(canvas, top, left, width, height) {
    canvas.style.top = top;
    canvas.style.left = left;
    canvas.style.width = width;
    canvas.style.height = height;
  }

  switchVisualizer(audioArray) {
    const canvas = this.visualizerWaveCanvas;
    const ctx = this.audioWaveCanvasCtx;
    const style = this.visualizerStyle;
    // const text = this.trackTitle.textContent;

    const circularStyle = {
      top: "-1.5%",
      left: "-9%",
      width: "45%",
      height: "35%",
    };
    const rectStyle = { top: "50%", left: "55%", width: "44%", height: "30%" };
    const mirrorRectStyle = {
      top: "70%",
      left: "10%",
      width: "40%",
      height: "10%",
    };
    switch (style) {
      case "None":
        break;
      case "radialBars":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(circularStyle)
        );
        radialBarsVisualizer(canvas, ctx, audioArray);
        break;
      case "radialBars2":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(circularStyle)
        );
        radialBarsVisualizer2(canvas, ctx, audioArray);
        break;
      case "waveform":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(rectStyle)
        );
        waveformStackedVisualizer(canvas, ctx, audioArray);
        // waveformVisualizer(canvas, ctx, audioArray);
        break;
      case "inverseWave":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(rectStyle)
        );
        inverseWaveformVisualizer(canvas, ctx, audioArray);
        break;

      case "inverseSmoothWave":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(rectStyle)
        );
        inverseSmoothWaveformVisualizer(canvas, ctx, audioArray);
        break;

      case "dotWave":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(rectStyle)
        );
        dotJumpVisualizer(canvas, ctx, audioArray);
        break;
      // case "partical":
      //   canvas.style.top = rectTop;
      //   canvas.style.left = rectLeft;
      //   canvas.style.width = rectWidth;
      //   canvas.style.height = rectHeight;
      //   particleBurstVisualizer(canvas, ctx, audioArray);
      //   break;

      case "roundBar":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(rectStyle)
        );
        roundedBarVisualizer(canvas, ctx, audioArray);
        break;
      // case "dotJump":
      //   this.setCanvasStyle(this.visualizerWaveCanvas, ...Object.values(rectStyle));
      //   dotJumpVisualizer(canvas, ctx, audioArray);
      //   break;

      case "lissajousCurve":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(circularStyle)
        );
        lissajousCurveVisualizer(canvas, ctx, audioArray);
        break;
      case "circularWave":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(circularStyle)
        );
        circularWaveVisualizer(canvas, ctx, audioArray);
        break;
      case "mirrorBar":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(mirrorRectStyle)
        );
        mirrorDotBarVisualizer(canvas, ctx, audioArray);
        // mirrorSpectrumVisualizer(canvas, ctx, audioArray);
        break;
      case "gooey":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(circularStyle)
        );
        gooeyVisualizer(canvas, ctx, audioArray);
        break;

      case "circularPulse":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(circularStyle)
        );
        circularPulseVisualizer(canvas, ctx, audioArray);
        break;
      case "gooeyWave":
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(rectStyle)
        );
        gooeyWaveVisualizer(
          canvas,
          ctx,
          audioArray,
          this.artistTextColor || undefined,
          this.artistBackgroundColor || undefined,
          this.artistBorderColor || undefined
        );
        // waterPuddleVisualizer(canvas, ctx, audioArray);
        break;
      default:
        this.setCanvasStyle(
          this.visualizerWaveCanvas,
          ...Object.values(circularStyle)
        );
        waveformStackedVisualizer(canvas, ctx, audioArray);
      // console.error("Unknown visualizer style:", style);
    }

    this.drawResponsiveImage(audioArray.slice(0, 20));
  }

  drawResponsiveImage(bassArray) {
    const bassAverage =
      bassArray.reduce((sum, value) => sum + value, 0) / bassArray.length;

    this.audioLogoCanvasCtx.clearRect(
      0,
      0,
      this.visualizerLogoCanvas.width,
      this.visualizerLogoCanvas.height
    );

    const supressScaler = 1;

    if (this.visualizerImage.complete) {
      const scaleFactor = bassAverage * supressScaler;
      let scaledHeight =
        this.visualizerLogoCanvas.height * (0.6 + 0.35 * scaleFactor);
      let scaledWidth =
        scaledHeight *
        (this.visualizerImage.width / this.visualizerImage.height);

      const x = (this.visualizerLogoCanvas.width - scaledWidth) * 0.6;
      const y = (this.visualizerLogoCanvas.height - scaledHeight) * 0.75;

      this.audioLogoCanvasCtx.drawImage(
        this.visualizerImage,
        x,
        y / 2,
        scaledWidth,
        scaledHeight
      );
    } else {
      console.error("Image not loaded yet");
    }
  }

  drawLightRays(audioArray) {
    const w = this.visualizerCanvas.width;
    const h = this.visualizerCanvas.height;

    const bassAverage =
      audioArray.slice(0, 20).reduce((sum, value) => sum + value, 0) / 20;
    const color = `hsl(${bassAverage * 360}, 100%, 50%)`; // Change color based on bass average

    const rayNum = 10; // Number of light rays
    for (let i = 0; i < rayNum; i++) {
      const angle = (i / rayNum) * Math.PI * 2;
      const x = w / 2 + Math.cos(angle) * w;
      const y = h / 2 + Math.sin(angle) * h;

      const gradient = this.audioCanvasCtx.createRadialGradient(
        w / 2,
        h / 2,
        0,
        w / 2,
        h / 2,
        Math.max(w, h)
      );
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

      this.audioCanvasCtx.beginPath();
      this.audioCanvasCtx.moveTo(w / 2, h / 2);
      this.audioCanvasCtx.lineTo(x, y);
      this.audioCanvasCtx.strokeStyle = gradient;
      this.audioCanvasCtx.lineWidth = 20;
      this.audioCanvasCtx.stroke();
    }
  }

  wallpaperMediaPlaybackListener(event) {
    console.log("Wallpaper media playback state changed:", event.state);

    // if (this.container.style.display === "none") {
    //   return
    // }
    clearTimeout(this.StopScreenTimer);
    if (event.state === 1) {
      // playing state
      this.vinylRecordImg.classList.remove("spin-360");
      this.startUpdateLoop();
      this.isPlaying = true;
      this.vinylRecordImg.classList.add("spin-360");
      this.vinylPlayIcon.style.display = "block";
      this.vinylPauseIcon.style.display = "none";
      this.vinylStopIcon.style.display = "none";
    } else if (event.state === 2) {
      // paused state
      this.stopUpdateLoop();
      this.isPlaying = false;
      this.vinylRecordImg.classList.remove("spin-360");
      this.vinylPlayIcon.style.display = "none";
      this.vinylPauseIcon.style.display = "block";
      this.vinylStopIcon.style.display = "none";
    } else if (event.state === 0) {
      //stop state
      if (this.isPlaying) {
        this.stopUpdateLoop();
        this.isPlaying = false;
      }
      this.setStopScreen();
      this.vinylRecordImg.classList.remove("spin-360");
      this.vinylPlayIcon.style.display = "none";
      this.vinylPauseIcon.style.display = "none";
      this.vinylStopIcon.style.display = "block";
    }
  }

  transitionInfoHub(artist, title) {
    clearTimeout(this["initTitleTimeout"]);
    clearTimeout(this["initArtistTimeout"]);
    this.stopMarquee(this.trackTitle, "trackTitleScrollTimeout");
    this.stopMarquee(this.artist, "artistScrollTimeout");
    if (artist == "" && title == "") {
      return;
    }
    this.trackTitle.style.opacity = 0; // Fade out current track title
    this["initTitleTimeout"] = setTimeout(() => {
      this.trackTitle.textContent = title || "Nothing Playing";
      this.trackTitle.style.opacity = 1; // Fade in updated track title
      if (
        this.trackTitle.scrollWidth >
        this.mediaTitleContainer.clientWidth * 0.79
      ) {
        const timeScroll =
          15 +
          (5 *
            (this.trackTitle.scrollWidth -
              this.mediaTitleContainer.clientWidth * 0.63)) /
            (0.1 * this.mediaTitleContainer.clientWidth);
        this.startMarquee(
          this.trackTitle,
          timeScroll,
          10000,
          "trackTitleScrollTimeout"
        );
      } else {
        this.trackTitle.style.animation = "";
      }
    }, 1000); // Shortened delay for quicker transitions

    // Animate artist container
    this.mediaArtistContainer.classList.add("retract-animation");
    this["initArtistTimeout"] = setTimeout(() => {
      this.artist.textContent = artist || "-";

      this.mediaArtistContainer.style.backgroundColor =
        this.artistBackgroundColor;
      this.mediaArtistContainer.style.borderColor = this.artistBorderColor;
      this.artist.style.color = this.artistTextColor;

      this.mediaArtistContainer.classList.remove("retract-animation");
      this.mediaArtistContainer.classList.add("expand-animation");
      setTimeout(() => {
        this.mediaArtistContainer.classList.remove("expand-animation");
        this.mediaArtistContainer.style.width = `55%`;
        if (
          this.artist.scrollWidth >
          this.mediaArtistContainer.clientWidth * 0.63
        ) {
          const timeScroll =
            10 +
            (10 *
              (this.artist.scrollWidth -
                this.mediaArtistContainer.clientWidth * 0.63)) /
              (0.1 * this.mediaArtistContainer.clientWidth);
          this.startMarquee(
            this.artist,
            timeScroll,
            10000,
            "artistScrollTimeout"
          );
        } else {
          this.artist.style.animation = "";
        }
      }, 2000);
    }, 1300);

    // Handle visualizer opacity
    this.visualizerWaveCanvas.style.opacity = 0;
    setTimeout(() => {
      this.visualizerWaveCanvas.style.opacity = 1;
    }, 2200);

    // Animate time info and progress bar
    this.timeInfo.classList.remove("visibleTimeInfo");
    this.timeInfo.classList.add("hiddenTimeInfo");
    this.progressBar.classList.remove("visibleTimeInfo");
    this.progressBar.classList.add("hiddenTimeInfo");
    setTimeout(() => {
      this.updateTimelineInfo();

      this.progressBar.style.backgroundColor = this.artistBackgroundColor;
      this.currentTimeDisplay.style.color = this.timeInfoTextColor;
      this.currentTimeDisplay.style.webkitTextStroke = `0.1vh ${this.timeInfoTextBorderColor}`;
      this.totalTimeDisplay.style.color = this.timeInfoTextColor;
      this.totalTimeDisplay.style.webkitTextStroke = `0.1vh ${this.timeInfoTextBorderColor}`;
      this.timeDivider.style.color = this.timeInfoTextColor;
      this.timeDivider.style.webkitTextStroke = `0.1vh ${this.timeInfoTextBorderColor}`;

      this.timeInfo.classList.remove("hiddenTimeInfo");
      this.timeInfo.classList.add("visibleTimeInfo");
      this.progressBar.classList.remove("hiddenTimeInfo");
      this.progressBar.classList.add("visibleTimeInfo");
    }, 1000); // Adjusted to match the general animation timing
  }

  startMarquee(element, time, delay, timeoutKey) {
    this.stopMarquee(element, timeoutKey);
    this[timeoutKey] = setTimeout(() => {
      element.style.animation = `marquee ${time}s linear infinite`;
      this[timeoutKey] = setTimeout(() => {
        element.style.animation = "";
        this.startMarquee(element, time, delay, timeoutKey);
      }, time * 1000);
    }, delay);
  }

  stopMarquee(element, timeoutKey) {
    if (this[timeoutKey]) {
      clearTimeout(this[timeoutKey]);
      this[timeoutKey] = null;
    }
    element.style.animation = "";
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  wallpaperMediaPropertiesListener(event) {
    console.log("Wallpaper media properties changed:", event);
    // let isUpdated = false;
    // if (this.trackTitle != null && event.title != this.trackTitle.textContent) {
    //   // this.updateText(this.trackTitle, event.title);
    //   isUpdated = true;
    // }
    // if (this.artist != null && event.artist != this.artist.textContent) {
    //   // this.updateText(this.artist, event.artist);
    //   isUpdated = true;
    // }
    // if (isUpdated) {
    //   this.trackName = event.title;
    //   this.updateStreamingCoverAndPreset(event.artist, event.title);
    //   let artistName = event.artist;
    //   if (Math.random() < 0.1) {
    //     artistName = this.getRandomAritsitNickname(event.artist);
    //   }
    //   this.transitionInfoHub(artistName, event.title);
    // }
    this.trackName = event.title;
    clearTimeout(this.updateMusicInfoTimeout);

    this.updateMusicInfoTimeout = setTimeout(() => {
      this.updateStreamingCoverAndPreset(event.artist, event.title);
      let artistName = event.artist;
      if (Math.random() < 0.1) {
        artistName = this.getRandomAritsitNickname(event.artist);
      }
      this.albumCoverArt.style.backgroundImage = `url(${this.albumCoverArtImage})`;
      this.transitionInfoHub(artistName, event.title);
      this.updateBackgroundColorPalette(
        this.thumbnailColorSet.artistTextColor,
        this.thumbnailColorSet.artistBackgroundColor,
        this.thumbnailColorSet.artistBorderColor,
        this.thumbnailColorSet.timeInfoTextColor,
        this.thumbnailColorSet.timeInfoTextBorderColor
      );
    }, 1500);
  }

  findSteamingServiceImage(text) {
    for (const service in this.videoStreamingServiceMap) {
      if (text.includes(service)) {
        return this.videoStreamingServiceMap[service]; // Return the image if a match is found
      }
    }
    return null; // Return null if no match is found
  }

  updateStreamingCoverAndPreset(artist, title) {
    if (title == "") {
      return;
    }
    if (artist == "") {
      const preset = this.findSteamingServiceImage(title);
      if (preset) {
        console.log("Found preset for", title, preset);
        this.albumCoverArtImage = preset.imagePath;
        // this.albumCoverArt.style.backgroundImage = `url(${preset.imagePath})`;
        this.thumbnailColorSet = {
          artistTextColor: preset.outlineColor,
          artistBackgroundColor: preset.primaryColor,
          artistBorderColor: preset.outlineColor,
          timeInfoTextColor: preset.textColor,
          timeInfoTextBorderColor: preset.outlineColor,
        };
        // this.updateBackgroundColorPalette(
        //   preset.outlineColor,
        //   preset.primaryColor,
        //   preset.outlineColor,
        //   preset.textColor,
        //   preset.outlineColor
        // );
        this.clearVisualizer();

        // this.mediaArtistContainer.style.backgroundColor = preset.primaryColor;
        // this.mediaArtistContainer.style.borderColor = preset.outlineColor;
        // this.artist.style.color = preset.outlineColor;
        // this.progressBar.style.backgroundColor = preset.primaryColor;
        // this.currentTimeDisplay.style.color = preset.textColor;
        // this.currentTimeDisplay.style.webkitTextStroke = `0.1vh ${preset.outlineColor}`;
        // this.totalTimeDisplay.style.color = preset.textColor;
        // this.totalTimeDisplay.style.webkitTextStroke = `0.1vh ${preset.outlineColor}`;
        // this.timeDivider.style.color = preset.textColor;
        // this.timeDivider.style.webkitTextStroke = `0.1vh ${preset.outlineColor}`;
      }
    }
    // } else {
    //   this.albumCoverArt.style.backgroundImage = `url(${this.albumCoverArtImage})`;
    //   this.updateBackgroundColorPalette(
    //     this.thumbnailColorSet.artistTextColor,
    //     this.thumbnailColorSet.artistBackgroundColor,
    //     this.thumbnailColorSet.artistBorderColor,
    //     this.thumbnailColorSet.timeInfoTextColor,
    //     this.thumbnailColorSet.timeInfoTextBorderColor
    //   );
    // }
  }

  updateBackgroundColorPalette(
    artistTextColor,
    artistBackgroundColor,
    artistBorderColor,
    timeInfoTextColor,
    timeInfoTextBorderColor
  ) {
    this.artistTextColor = artistTextColor;
    this.artistBackgroundColor = artistBackgroundColor;
    this.artistBorderColor = artistBorderColor;
    this.timeInfoTextColor = timeInfoTextColor;
    this.timeInfoTextBorderColor = timeInfoTextBorderColor;
  }

  // Function to update text and apply transition effect
  updateText(element, newText) {
    // Remove the visible class to reset the transition
    element.classList.remove("visible");
    element.classList.add("hidden");

    // Set a timeout to allow the transition to complete before changing the text
    setTimeout(() => {
      element.textContent = newText;
      element.classList.remove("hidden");
      element.classList.add("visible");
    }, 3000); // Timeout should match the duration of the transition
  }

  wallpaperMediaThumbnailListener(event) {
    if (!this.albumCoverArt || event.thumbnail === "data:image/png;base64,") {
      this.albumCoverArtImage = "resource/image/unknow_faction_bg.png";
      return;
    }

    this.albumCoverArtImage = event.thumbnail;
    this.thumbnailColorSet = {
      artistTextColor: event.textColor,
      artistBackgroundColor: event.primaryColor,
      artistBorderColor: event.secondaryColor,
      timeInfoTextColor: event.primaryColor,
      timeInfoTextBorderColor: event.highContrastColor,
    };
    this.clearVisualizer();
  }

  wallpaperMediaTimelineListener(event) {
    // console.log("Wallpaper media timeline changed:", event);
    this.accurateCurrentTime = event.position;
    this.totalDuration = event.duration;
    this.lastUpdateTime = performance.now();
    this.updateTimelineInfo();
  }

  clearEventListeners() {
    if (window.wallpaperRegisterMediaPropertiesListener) {
      window.wallpaperRegisterMediaPropertiesListener(() => {});
      console.log("Cleared wallpaperMediaPropertiesListener");
    }

    if (window.wallpaperRegisterMediaThumbnailListener) {
      window.wallpaperRegisterMediaThumbnailListener(() => {});
      console.log("Cleared wallpaperMediaThumbnailListener");
    }

    if (window.wallpaperRegisterMediaTimelineListener) {
      window.wallpaperRegisterMediaTimelineListener(() => {});
      console.log("Cleared wallpaperMediaTimelineListener");
    }

    if (window.wallpaperRegisterMediaPlaybackListener) {
      window.wallpaperRegisterMediaPlaybackListener(() => {});
      console.log("Cleared wallpaperMediaPlaybackListener");
    }
    if (window.wallpaperRegisterAudioListener) {
      window.wallpaperRegisterAudioListener(() => {});
      console.log("Cleared wallpaperAudioListener");
    }
  }

  registerEvent(eventName, listenerFn, errorMsg) {
    if (window[eventName]) {
      window[eventName](listenerFn.bind(this));
      console.log(`Registered ${eventName}`);
    } else {
      console.error(`${errorMsg} is not a function`);
    }
  }

  registerEventListeners() {
    this.registerEvent(
      "wallpaperRegisterMediaPropertiesListener",
      this.wallpaperMediaPropertiesListener,
      "wallpaperRegisterMediaPropertiesListener"
    );
    this.registerEvent(
      "wallpaperRegisterMediaThumbnailListener",
      this.wallpaperMediaThumbnailListener,
      "wallpaperRegisterMediaThumbnailListener"
    );
    this.registerEvent(
      "wallpaperRegisterMediaTimelineListener",
      this.wallpaperMediaTimelineListener,
      "wallpaperRegisterMediaTimelineListener"
    );
    this.registerEvent(
      "wallpaperRegisterMediaPlaybackListener",
      this.wallpaperMediaPlaybackListener,
      "wallpaperRegisterMediaPlaybackListener"
    );
    this.registerEvent(
      "wallpaperRegisterAudioListener",
      this.wallpaperAudioListener,
      "wallpaperRegisterAudioListener"
    );
  }
  // test(event){
  //   console.log("Test event triggered:", event);
  // }

  simulateEvents() {
    setTimeout(() => {
      const event = {
        title: "Test Title",
        artist: "Test Artist",
        thumbnail: "resource/placeholder/yohta_nervous.png",
        highContrastColor: "#ffffff",
        secondaryColor: "#ff0000",
        primaryColor: "#000fff",
        tertiaryColor: "#76b852",
        state: "playing",
        position: 120,
        duration: 240,
      };

      this.wallpaperMediaPropertiesListener(event);
      this.wallpaperMediaThumbnailListener(event);
      this.wallpaperMediaPlaybackListener({ state: event.state });
      this.wallpaperMediaTimelineListener({
        position: event.position,
        duration: event.duration,
      });
      console.log("Simulated events triggered");
    }, 1000); // Simulate a delay
  }
}
