import {
  fetchSVGIcon,
  debounce,
  getDayOfWeek,
  aggregateDailyTemperatures,
  getFormattedDateAndDay,
  parseWeatherData,
} from "./utils.js";

import {
  getSampleForecast,
  getSampleCurrentWeather,
} from "./sample_forecast.js";

import { anchorConfigDict } from "./anchor_config.js";

export class WeatherChannel {
  constructor(wallpaperSettings) {
    this.wallpaperSettings = wallpaperSettings;
    this.apiKey = "";
    this.city = "";
    this.lat = 51.505;
    this.lon = -0.10707;
    this.units = "metric"; // Change to "imperial" for Fahrenheit

    this.windUnit = "m/s"; // Change to "m/h" for MPH

    this.degree = "°";
    this.tempUnit = "C";

    this.weatherTodayData = null;

    this.switchInfoPanelID = null;
    this.isOnTodayInfoPanel = true;

    this.updateWeatherIntervalID = null;

    this.errorMsgMissingAPI =
      "Please provide a valid API key and Location's Latitude and Longitude in the wallpaper settings.";

    this.weatherConditions = {
      clear: "resource/svg/sun.svg",
      clouds: "resource/svg/cloud.svg",
      mist: "resource/svg/mist.svg",
      smoke: "resource/svg/smoke.svg",
      haze: "resource/svg/sun-haze.svg",
      dust: "resource/svg/sand-storm.svg",
      fog: "resource/svg/cloud-fog.svg",
      sand: "resource/svg/sand-storm.svg",
      dust: "resource/svg/sun-dust.svg",
      ash: "resource/svg/sand-storm.svg",
      squall: "resource/svg/squall.svg",
      tornado: "resource/svg/tornado.svg",
      snow: "resource/svg/snowflake.svg",
      rain: "resource/svg/cloud-rain-thick.svg",
      drizzle: "resource/svg/cloud-drizzle.svg",
      thunderstorm: "resource/svg/cloud-bolt.svg",
    };
    this.backgroundImageList = Array.from(
      { length: 6 },
      (_, i) => `resource/background/news_bg${i + 1}.png`
    );
    this.anchorConfigDict = anchorConfigDict;

    this.setWallpaperSettingsDebounce = debounce(
      this.setWallpaperSettings.bind(this),
      5000
    );

    this.container = this.initWeatherChannel(); // Initialize container

    this.setAPIKey(this.wallpaperSettings.weather_api_key);
    this.setCity(this.wallpaperSettings.weather_city);
    this.setLatitue(this.wallpaperSettings.weather_latitude);
    this.setLongitude(this.wallpaperSettings.weather_longitude);
    this.updateWeather();
    this.switchInPanelAnimation();
    this.startAutoWeatherUpdateInterval();
    setTimeout(() => {
      this.startAutoAnchorBroacastAnimation();
    }, 5000);
    this.debugFunction();
  }

  initWeatherChannel() {
    const container = document.createElement("div");
    container.classList.add("weather-channel");
    container.id = "weather-channel-container";

    /// BACKGROUND IMAGE CONTAINER ///
    const weatherInfoContainer = document.createElement("div");
    weatherInfoContainer.id = "weather-info-container";

    const weatherBackground = document.createElement("div");
    weatherBackground.id = "weather-background";
    weatherBackground.style.backgroundImage = `url(${
      this.backgroundImageList[
        Math.floor(Math.random() * this.backgroundImageList.length)
      ]
    })`;

    weatherInfoContainer.append(
      weatherBackground
    );
    this.weatherBackground = weatherBackground;
    const zzzLogoContainer = document.createElement("div");
    zzzLogoContainer.id = "zzz-logo-weather-container";

    const zzzLogo = document.createElement("img");
    zzzLogo.id = "zzz-logo-weather";
    zzzLogo.src = "resource/image/zzz_logo_horizontal.png";

    zzzLogoContainer.append(zzzLogo);

    /// TODAY WEATHER CONTAINER ///
    const weatherTodayContainer = document.createElement("div");
    weatherTodayContainer.id = "weather-today-container";
    weatherTodayContainer.classList.add("weather-today");
    // weatherTodayContainer.textContent = "0";

    const weatherLocationText = document.createElement("div");
    weatherLocationText.id = "weather-location";
    weatherLocationText.textContent = "New York, USA";

    const weatherLocationIcon = document.createElement("div");
    weatherLocationIcon.id = "weather-location-icon";
    fetchSVGIcon("resource/svg/location.svg", weatherLocationIcon);

    const weatherTodayConditionBox = document.createElement("div");
    weatherTodayConditionBox.id = "weather-today-condition-box";


    const weatherTodayIcon = document.createElement("div");
    weatherTodayIcon.id = "weather-today-icon";
    fetchSVGIcon("resource/svg/calendar-day.svg", weatherTodayIcon);
  

    const dayOfWeekToday = document.createElement("div");
    dayOfWeekToday.id = "day-of-week-today";
    dayOfWeekToday.textContent = "Wednesday".toUpperCase();

    const weatherTodayTemperatureText = document.createElement("div");
    weatherTodayTemperatureText.id = "weather-today-temp";
    weatherTodayTemperatureText.textContent = "000";

    const weatherTodayConditionText = document.createElement("div");
    weatherTodayConditionText.id = "weather-today-condition";
    weatherTodayConditionText.textContent = "thunderstorm".toUpperCase();

    const weatherTodayConditionIcon = document.createElement("div");
    weatherTodayConditionIcon.id = "weather-today-condition-icon"; 
    fetchSVGIcon(this.weatherConditions["clear"],weatherTodayConditionIcon);


    weatherTodayContainer.append(
      weatherLocationText,
      weatherLocationIcon,
      dayOfWeekToday,
      weatherTodayIcon,
      weatherTodayTemperatureText,
      weatherTodayConditionText,
      weatherTodayConditionIcon,
      weatherTodayConditionBox
    );

    /// SUB INFO CONTAINER ///
    const weatherSubInfoContainer = document.createElement("div");
    weatherSubInfoContainer.id = "weather-sub-info-container";

    const feelsLikeContainer = document.createElement("div");
    feelsLikeContainer.id = "feels-like-container";

    const feelsLikeIcon = document.createElement("div");
    feelsLikeIcon.id = "feels-like-icon";
    fetchSVGIcon("resource/svg/hand-holding.svg", feelsLikeIcon);

    const feelsLikeTempIcon = document.createElement("div");
    feelsLikeTempIcon.id = "feels-like-temp-icon";
    fetchSVGIcon(
      "resource/svg/temperature-three-quarters.svg",
      feelsLikeTempIcon
    );

    const feelsLikeTitle = document.createElement("div");
    feelsLikeTitle.id = "feels-like-title";
    feelsLikeTitle.textContent = "FEELS LIKE";

    const feelsLikeTemperatureText = document.createElement("div");
    feelsLikeTemperatureText.id = "feels-like-temp";
    feelsLikeTemperatureText.textContent = "131";

    feelsLikeContainer.append(
      feelsLikeIcon,
      feelsLikeTempIcon,
      // feelsLikeTitle,
      feelsLikeTemperatureText
    );

    const humidityContainer = document.createElement("div");
    humidityContainer.id = "humidity-container";

    const humidityIcon = document.createElement("div");
    humidityIcon.id = "humidity-icon";
    fetchSVGIcon("resource/svg/droplet-percent.svg", humidityIcon);

    const humidityTitle = document.createElement("div");
    humidityTitle.id = "humidity-title";
    humidityTitle.textContent = "HUMIDITY";

    const humidityText = document.createElement("div");
    humidityText.id = "humidity-text";
    humidityText.textContent = "63%";

    humidityContainer.append(
      humidityIcon,
      // humidityTitle,
      humidityText
    );

    const popContainer = document.createElement("div");
    popContainer.id = "pop-container";

    const popIcon = document.createElement("div");
    popIcon.id = "pop-icon";
    fetchSVGIcon("resource/svg/cloud-rain-thick.svg", popIcon);

    // const maxTemperatureTitle = document.createElement("div");
    // maxTemperatureTitle.id = "max-temperature-title";
    // maxTemperatureTitle.textContent = "MAX TEMPERATURE";

    const popText = document.createElement("div");
    popText.id = "pop-text";
    popText.textContent = "120";

    popContainer.append(popIcon, popText);

    const windContainer = document.createElement("div");
    windContainer.id = "wind-container";

    const windIcon = document.createElement("div");
    windIcon.id = "wind-icon";
    fetchSVGIcon("resource/svg/wind.svg", windIcon);

    // const minTemperatureTitle = document.createElement("div");
    // minTemperatureTitle.id = "min-temperature-title";
    // minTemperatureTitle.textContent = "TEMPERATURE";

    const windText = document.createElement("div");
    windText.id = "wind-text";
    windText.textContent = "90%";

    windContainer.append(windIcon, windText);

    weatherSubInfoContainer.append(
      feelsLikeContainer,
      humidityContainer,
      popContainer,
      windContainer
    );

    this.weatherSubInfoContainer = weatherSubInfoContainer;
    this.feelsLikeTemperatureText = feelsLikeTemperatureText;
    this.humidityText = humidityText;
    this.popText = popText;
    this.windText = windText;

    /// FORECAST CONTAINER ///
    const weatherForecastMasterContainer = document.createElement("div");
    weatherForecastMasterContainer.id = "weather-forecast-master-container";

    this.weatherForecastList = {};
    for (let i = 0; i < 3; i++) {
      const weatherForecastContainer = document.createElement("div");
      weatherForecastContainer.id = `weather-forecast-container-${i}`;

      const weatherForecastDateIcon = document.createElement("div");
      weatherForecastDateIcon.id = `weather-forecast-date-icon-${i}`;
      fetchSVGIcon("resource/svg/calendar-day.svg", weatherForecastDateIcon);
      weatherForecastDateIcon.classList.add("weather-forecast-date-icon");

      const weatherForecastDateText = document.createElement("div");
      weatherForecastDateText.id = `weather-forecast-date-${i}`;
      weatherForecastDateText.textContent = "Thursday".toUpperCase();
      weatherForecastDateText.classList.add("weather-forecast-date");

      const weatherForecastAvgTemp = document.createElement("div");
      weatherForecastAvgTemp.id = `weather-forecast-avg-temp-${i}`;
      weatherForecastAvgTemp.classList.add("weather-forecast-avg-temp");

      const weatherForecastAvgTempBg = document.createElement("div");
      weatherForecastAvgTempBg.id = `weather-forecast-avg-temp-bg-${i}`;
      weatherForecastAvgTempBg.classList.add("weather-forecast-avg-temp-bg");

      const weatherForecastTempMinText = document.createElement("div");
      weatherForecastTempMinText.id = `weather-forecast-temp-min-${i}`;
      weatherForecastTempMinText.textContent =
        "200" + this.degree + this.tempUnit;
      weatherForecastTempMinText.classList.add("weather-forecast-temp-min");

      const weatherForecastTempMaxText = document.createElement("div");
      weatherForecastTempMaxText.id = `weather-forecast-temp-max-${i}`;
      weatherForecastTempMaxText.textContent =
        "300" + this.degree + this.tempUnit;
      weatherForecastTempMaxText.classList.add("weather-forecast-temp-max");

      const weatherForecastTempIcon = document.createElement("div");
      weatherForecastTempIcon.id = `weather-forecast-temp-icon-${i}`;
      fetchSVGIcon(
        "resource/svg/temperature-three-quarters.svg",
        weatherForecastTempIcon
      );
      weatherForecastTempIcon.classList.add("weather-forecast-temp-icon");

      const weatherForecastConditionIcon = document.createElement("div");
      weatherForecastConditionIcon.id = `weather-forecast-condition-icon-${i}`;
      fetchSVGIcon("resource/svg/cloud-bolt.svg", weatherForecastConditionIcon);
      weatherForecastConditionIcon.classList.add(
        "weather-forecast-condition-icon"
      );

      const weatherForecastConditionText = document.createElement("div");
      weatherForecastConditionText.id = `weather-forecast-condition-${i}`;
      weatherForecastConditionText.textContent = "THRUNDERSTORM";
      weatherForecastConditionText.classList.add("weather-forecast-condition");

      const weatherForecastPopIcon = document.createElement("div");
      weatherForecastPopIcon.id = `weather-forecast-pop-icon-${i}`;
      weatherForecastPopIcon.classList.add("weather-forecast-pop-icon");
      fetchSVGIcon("resource/svg/cloud-rain.svg", weatherForecastPopIcon);

      const weatherForecastPopText = document.createElement("div");
      weatherForecastPopText.id = `weather-forecast-pop-${i}`;
      weatherForecastPopText.textContent = "89%";
      weatherForecastPopText.classList.add("weather-forecast-pop");

      const weatherForecastPopTextBg = document.createElement("div");
      weatherForecastPopTextBg.id = `weather-forecast-pop-bg-${i}`;
      weatherForecastPopTextBg.textContent = "89%";
      weatherForecastPopTextBg.classList.add("weather-forecast-pop-bg");

      const avgWidth = ((28 - 20) / (30 - 20)) * 100 * (50 / 100);
      weatherForecastAvgTemp.style.width = `${avgWidth}%`;

      const popFill = 34 * 0.85;
      weatherForecastPopTextBg.style.clipPath = `inset(0 0 ${popFill}% 0)`;

      weatherForecastContainer.append(
        weatherForecastDateIcon,
        weatherForecastDateText,
        weatherForecastAvgTemp,
        weatherForecastAvgTempBg,
        weatherForecastTempMinText,
        weatherForecastTempMaxText,
        // weatherForecastTempIcon,
        weatherForecastConditionIcon,
        weatherForecastConditionText,
        weatherForecastPopIcon,
        weatherForecastPopText,
        weatherForecastPopTextBg
      );

      this.weatherForecastList[i] = {
        weatherForecastContainer: weatherForecastContainer,
        weatherForecastDateIcon: weatherForecastDateIcon,
        weatherForecastDateText: weatherForecastDateText,
        weatherForecaseAvgTemp: weatherForecastAvgTemp,
        weatherForecastTempMinText: weatherForecastTempMinText,
        weatherForecastTempMaxText: weatherForecastTempMaxText,
        weatherForecastConditionIcon: weatherForecastConditionIcon,
        weatherForecastConditionText: weatherForecastConditionText,
        weatherForecastPopIcon: weatherForecastPopIcon,
        weatherForecastPopText: weatherForecastPopText,
        weatherForecastPopTextBg: weatherForecastPopTextBg,
      };

      weatherForecastMasterContainer.append(weatherForecastContainer);
    }
    this.weatherForecastMasterContainer = weatherForecastMasterContainer;

    // weatherForecastContainer.classList.add("weather-forecast");

    /// ANCHOR FOR WEATHER CHANNEL ///
    const weatherAnchorContainer = document.createElement("div");
    weatherAnchorContainer.id = "weather-anchor-container";
    weatherAnchorContainer.style.opacity = "0";

    // const weatherAnchorImageContainer = document.createElement("div");
    // weatherAnchorImageContainer.id = "weather-anchor-image-container";

    const weatherAnchor = document.createElement("img");
    weatherAnchor.id = "weather-anchor";
    weatherAnchor.src = "resource/anchor/von_lycaon.png";

    // weatherAnchorImageContainer.append(weatherAnchor)

    const weatherAnchorSpeechBubbleContainer = document.createElement("div");
    weatherAnchorSpeechBubbleContainer.id =
      "weather-anchor-speech-bubble-container";
    weatherAnchorSpeechBubbleContainer.style.transform = "scale(0)";

    const weatherAnchorSpeechBubble = document.createElement("img");
    weatherAnchorSpeechBubble.id = "weather-anchor-speech-bubble";
    weatherAnchorSpeechBubble.src = "resource/image/speechbubble_bot.svg";
    // weatherAnchorSpeechBubble.style.backgroundImage = "url(resource/image/speech_bubble.svg)";
    // fetchSVGIcon("resource/image/speech_bubble.svg", weatherAnchorSpeechBubble);
    // weatherAnchorSpeechBubble.style.transform = "scale(0)";
    // weatherAnchorSpeechBubble.classList.add("hide-scale");

    const weatherAnchorTextContainer = document.createElement("div");
    weatherAnchorTextContainer.id = "weather-anchor-text-container";
    // weatherAnchorText.textContent = "Looks like a thunderstorm today!";
    weatherAnchorSpeechBubbleContainer.append(
      weatherAnchorSpeechBubble,
      weatherAnchorTextContainer
    );
    weatherAnchorSpeechBubbleContainer.style.transform = "scale(0)";

    this.weatherAnchorContainer = weatherAnchorContainer;
    this.weatherAnchor = weatherAnchor;
    this.weatherAnchorSpeechBubbleContainer =
      weatherAnchorSpeechBubbleContainer;
    this.weatherAnchorTextContainer = weatherAnchorTextContainer;
    this.weatherAnchorSpeechBubble = weatherAnchorSpeechBubble;
    weatherAnchorContainer.append(
      weatherAnchor,
      weatherAnchorSpeechBubbleContainer
      // weatherAnchorTextContainer
    );

    /// SECONTION FOR WEATHER CHANNEL BANNER ///
    const weatherChannelTitleContainer = document.createElement("div");
    weatherChannelTitleContainer.id = "weather-channel-title-container";

    const weatherChannelTitleText = document.createElement("div");
    weatherChannelTitleText.id = "weather-channel-title-text";
    weatherChannelTitleText.textContent = "Weather Channel";

    const weatherBannerContainer = document.createElement("div");
    weatherBannerContainer.id = "weather-banner-container";
    weatherBannerContainer.classList.add("weather-banner");

    const weatherBannerLeft = document.createElement("div");
    weatherBannerLeft.id = "weather-banner-left";

    const weatherBannerRight = document.createElement("div");
    weatherBannerRight.id = "weather-banner-right";

    const weatherBannerBot = document.createElement("div");
    weatherBannerBot.id = "weather-banner-bot";

    const weatherBannerChannelText = document.createElement("div");
    weatherBannerChannelText.id = "weather-banner-channel-text";
    weatherBannerChannelText.textContent = "NEWS";

    const weatherBannerText = document.createElement("div");
    weatherBannerText.id = "weather-banner-text";
    weatherBannerText.textContent = "weather now".toUpperCase();

    const weatherBannerSubText = document.createElement("div");
    weatherBannerSubText.id = "weather-banner-sub-text";
    weatherBannerSubText.textContent = "Powered by OpenWeather.org";
    weatherBannerSubText.classList.add("infinity-scroll-animation");
    // weatherBannerSubText.classList.add("marquee-content");
    // weatherBannerSubText.classList.add("marquee");

    const weatherWarningMsg = document.createElement("div");
    weatherWarningMsg.id = "weather-warning-msg";
    weatherWarningMsg.innerHTML = "";

    weatherBannerContainer.append(
      weatherBannerLeft,
      weatherBannerRight,
      weatherBannerBot,
      weatherBannerText,
      weatherBannerChannelText,
      weatherBannerSubText
    );

    this.weatherTodayIcon = weatherTodayIcon;
    this.weatherTodayTemperatureText = weatherTodayTemperatureText;
    this.dayOfWeekToday = dayOfWeekToday;
    this.weatherLocationText = weatherLocationText;
    this.weatherTodayConditionText = weatherTodayConditionText;
    this.weatherTodayConditionIcon = weatherTodayConditionIcon;
    this.weatherBannerText = weatherBannerText;
    this.weatherWarningMsg = weatherWarningMsg;

    container.append(
      zzzLogoContainer,
      weatherInfoContainer,
      weatherTodayContainer,
      weatherSubInfoContainer,
      weatherForecastMasterContainer,
      weatherChannelTitleContainer,
      weatherAnchorContainer,
      weatherBannerContainer,
      weatherWarningMsg
    );
    return container;
  }

  switchInPanelAnimation() {
    const minInterval = 60 * 1000 * 2; // 2 minutes in milliseconds
    const maxInterval = 60 * 1000 * 5; // 5 minutes in milliseconds
    const randomInterval =
      Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;

    this.switchInfoPanelID = setTimeout(() => {
      const fadeOutElement = this.isOnTodayInfoPanel
        ? this.weatherSubInfoContainer
        : this.weatherForecastMasterContainer;
      const fadeInElement = this.isOnTodayInfoPanel
        ? this.weatherForecastMasterContainer
        : this.weatherSubInfoContainer;
      
      const CurrentBannerText = this.isOnTodayInfoPanel
        ? "Weather Forecast".toUpperCase()
        : "Weather Now".toUpperCase();
      
      this.weatherBannerText.style.animation = 'none';
      this.weatherBannerText.style.borderRight = '0.15em solid black';
      void this.weatherBannerText.offsetWidth;
      this.weatherBannerText.style.width = "0%";
      this.weatherBannerText.textContent = CurrentBannerText;
      this.weatherBannerText.style.animation = 'typing 3.5s steps(30, end), blink-caret 0.75s step-end infinite';

      setTimeout(() => {
        this.weatherBannerText.style.animation = 'none';
        this.weatherBannerText.style.width = 'auto';
        this.weatherBannerText.style.borderRight = 'none';
      }, 3500);

      this.fadeOut(fadeOutElement, () => {
        this.fadeIn(fadeInElement);
        this.isOnTodayInfoPanel = !this.isOnTodayInfoPanel;
        // Call the function again to create another random interval
        this.switchInPanelAnimation();
      });
    }, randomInterval);
  }

  fadeOut(element, callback) {
    element.classList.add("right-fadeOut");
    setTimeout(() => {
      element.style.opacity = 0;
      element.classList.remove("right-fadeOut");
      if (callback) callback();
    }, 3000); // Assuming 3s for the fade-out animation
  }

  fadeIn(element) {
    element.classList.add("right-fadeIn");
    setTimeout(() => {
      element.style.opacity = 1;
      element.classList.remove("right-fadeIn");
    }, 3000); // Assuming 3s for the fade-in animation
  }

  stopTimeout(timeoutId) {
    clearTimeout(timeoutId);
  }

  showText(textContainer, text = "", index = 0, textDelay = 70) {
    if (index < text.length) {
      const char = text.charAt(index);
      const span = document.createElement("span");

      span.textContent = char;
      span.className = "letter";
      textContainer.appendChild(span);

      // Wait for the animation to complete before replacing span with text
      setTimeout(() => {
        // Remove the span and replace with the plain text
        span.replaceWith(document.createTextNode(char));
      }, textDelay); // Duration should match the animation duration in CSS

      index++;
      setTimeout(() => this.showText(textContainer, text, index), textDelay); // Adjust the time delay (in milliseconds) to speed up or slow down the effect
    }
  }
  //this.weatherAnchorContainer = weatherAnchorContainer;
  // this.weatherAnchor = weatherAnchor;
  // this.weatherAnchorTextContainer = weatherAnchorTextContainer;
  // this.weatherAnchorSpeechBubble = weatherAnchorSpeechBubble;
  debugFunction() {
    // setTimeout(() => {
    //   this.anchorBroadcastAnimation();
    // }, 3000);
  }

  startAutoAnchorBroacastAnimation() {
    this.anchorBroadcastAnimation();
    this.weatherBackground.style.backgroundImage = `url(${
      this.backgroundImageList[
        Math.floor(Math.random() * this.backgroundImageList.length)
      ]
    })`;
    setInterval(() => {
      this.anchorBroadcastAnimation();
      // console.log(`url(${this.backgroundImageList[Math.floor(Math.random() * this.backgroundImageList.length)]})`)
      this.weatherBackground.style.backgroundImage = `url(${
        this.backgroundImageList[
          Math.floor(Math.random() * this.backgroundImageList.length)
        ]
      })`;
    }, 30 * 60 * 1000); // 10 minutes
  }

  async anchorBroadcastAnimation() {
    if (this.weatherTodayData === undefined || this.weatherTodayData === null) {
      console.log("weather data is not available. Retrying...");
      return;
    }

    const weatherCondtionNow =
      this.weatherTodayData.main.toLowerCase() ?? "clear";
    // const weatherCondtionNow = "drizzle";
    const keys = Object.keys(this.anchorConfigDict);
    const randomIndex = Math.floor(Math.random() * keys.length);
    const anchorName = keys[randomIndex];
    // const anchorName = "soukaku"
    // Using optional chaining and nullish coalescing to safely access properties
    const anchorConfig = this.anchorConfigDict?.[anchorName];

    if (!anchorConfig) {
      console.error(`No configuration found for anchor: ${anchorName}`);
      return;
    }

    this.weatherAnchor.src = anchorConfig.image || "default-image-path"; // Provide a default image path if undefined
    this.weatherAnchor.style.width = `${anchorConfig.width ?? 100}%`; // Default to 100% if width is undefined
    this.weatherAnchor.style.height = `${anchorConfig.height ?? 100}%`; // Default to 100% if height is undefined
    this.weatherAnchor.style.top = `${anchorConfig.top ?? 0}%`; // Default to 0% if top is undefined
    this.weatherAnchor.style.left = `${anchorConfig.left ?? 0}%`; // Default to 0% if left is undefined

    const speechBubbleConfig = anchorConfig?.textResponse?.[weatherCondtionNow];

    if (speechBubbleConfig) {
      this.weatherAnchorSpeechBubble.src =
        anchorConfig.speechBubble || "resource/image/speechbubble_mid.svg"; // Provide a default speech bubble path if undefined
      this.weatherAnchorSpeechBubbleContainer.style.top = `${
        speechBubbleConfig.top ?? 0
      }%`;
      this.weatherAnchorSpeechBubbleContainer.style.left = `${
        speechBubbleConfig.left ?? 0
      }%`;
      this.weatherAnchorSpeechBubbleContainer.style.width = `${
        speechBubbleConfig.width ?? 100
      }%`;
      this.weatherAnchorSpeechBubbleContainer.style.height = `${
        speechBubbleConfig.height ?? 100
      }%`;
    } else {
      console.warn(
        `No text response configuration found for weather condition: ${weatherCondtionNow}`
      );
      // Optionally, handle cases where the text response is missing (e.g., set default styles or hide the speech bubble)
    }

    this.weatherAnchorContainer.style.transform = "translateX(100)";
    this.weatherAnchorContainer.style.opacity = 1;
    this.weatherAnchorContainer.classList.add("anchor-movein-right");

    await this.wait(2500);
    this.weatherAnchorContainer.classList.remove("anchor-movein-right");
    this.weatherAnchorContainer.style.opacity = 1;
    this.weatherAnchorContainer.style.transform = "translateX(0)";

    await this.wait(500);
    this.weatherAnchorSpeechBubbleContainer.style.transform = "scale(0)";
    this.weatherAnchorSpeechBubbleContainer.classList.add("popup");

    await this.wait(1000);
    this.weatherAnchorSpeechBubbleContainer.classList.remove("popup");
    this.weatherAnchorSpeechBubbleContainer.style.transform = "scale(1)";
    const { text } =
      this.anchorConfigDict[anchorName].textResponse[weatherCondtionNow] ??
      `Today is a ${weatherCondtionNow} weather`;
    this.showText(this.weatherAnchorTextContainer, text, 0, 10);

    await this.wait(100 * text.length + 6000);
    this.weatherAnchorSpeechBubble.classList.add("popdown");
    this.weatherAnchorTextContainer.innerHTML = "";

    await this.wait(1000);
    this.weatherAnchorContainer.classList.add("anchor-moveout-right");

    await this.wait(2000);
    this.weatherAnchorSpeechBubble.classList.remove("popdown");
    this.weatherAnchorContainer.classList.remove("anchor-moveout-right");
    this.weatherAnchorContainer.style.opacity = 0;
    this.weatherAnchorSpeechBubble.style.transform = "translateX(100%)";
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // checkPrefetchSetup() {
  //   if (!this.apiKey || !this.city) {
  //     this.weatherWarningMsg.style.display = "block";
  //   } else {
  //     this.weatherWarningMsg.style.display = "none";
  //   }
  // }

  setWallpaperSettings(wallpaperSettings) {
    this.wallpaperSettings = wallpaperSettings;
    if (this.wallpaperSettings.weather_api) {
      this.setAPIKey(this.wallpaperSettings.weather_api);
    }
    // if (this.wallpaperSettings.weather_city) {
    //   this.setCity(this.wallpaperSettings.weather_city);
    // }
    if (this.wallpaperSettings.weather_latitude) {
      this.setLatitue(this.wallpaperSettings.weather_latitude);
    }
    if (this.wallpaperSettings.weather_longitude) {
      this.setLongitude(this.wallpaperSettings.weather_longitude);
    }
    if (this.wallpaperSettings.weather_unit) {
      this.setUnit();
    }
    console.log(this.wallpaperSettings)
    setTimeout(() => {
      this.updateWeather();
    }, 1000);
  }

  setUnit() {
    this.units = this.wallpaperSettings.weather_unit;
    switch (this.units) {
      case "metric":
        this.windUnit = "m/s";
        this.tempUnit = "C";
        break;
      case "imperial":
        this.windUnit = "mph";
        this.tempUnit = "F";
        break;
      default:
        this.windUnit = "m/s";
        this.tempUnit = "K";
    }
    // this.updateWeather();
  }

  show() {
    this.container.style.display = "block";
  }

  hide() {
    this.container.style.display = "none";
  }

  getContainer() {
    return this.container;
  }

  setAPIKey(apiKey) {
    // if (!apiKey || apiKey.trim().length != 32) {
    //   console.log("API key should be 32 characters long");
    //   return;
    // }
    // apiKey = apiKey.trim();
    // if (this.apiKey === apiKey) {
    //   console.log("API key is the same, no need to update");
    //   return;
    // }
    this.apiKey = apiKey;
    // this.updateWeather();
  }

  setCity(city) {
    // if (!city || city.trim().length < 2) {
    //   console.log("City name should be at least 2 characters long");
    //   return;
    // }
    // city = city.trim();
    // if (this.city === city) {
    //   console.log("City is the same, no need to update");
    //   return;
    // }
    this.city = city;
    // this.updateWeather();
  }

  setLatitue(lat) {
    this.lat = lat;
    // this.updateWeather();
  }
  setLongitude(lon) {
    this.lon = lon;
    // this.updateWeather();
  }

  startAutoWeatherUpdateInterval() {
    this.updateWeatherIntervalID = setInterval(() => {
      console.log("Auto hourly updating weather...");
      this.updateWeather();
    }, 1000 * 60 * 60); // 1 hour
  }

  async fetchLatlongGeo() {
    // const response = await fetch(
    //   `https://api.openweathermap.org/geo/1.0/direct?q=${this.city}&limit=1&appid=${this.apiKey}`
    // );
    const limit = 1;
    const response = await fetch(
      `http://api.openweathermap.org/geo/1.0/reverse?lat=${this.lat}&lon=${this.lon}&limit=${limit}&appid=${this.apiKey}`
    );
    if (!response.ok) {
      throw new Error("Geo data not available, please check your internet connection/api key/geo data");
    }
    const data = await response.json();
    if (data.length === 0) {
      throw new Error("City not found");
    }
    return data
    // return data[0].lat.toFixed(2) + "," + data[0].lon.toFixed(2);
  }

  async fetchCurrentWeather() {
    // const response = await fetch(
    //   `https://api.openweathermap.org/data/2.5/weather?q=${this.city}&units=${this.units}&appid=${this.apiKey}`
    // );
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${this.lat}&lon=${this.lon}&units=${this.units}&appid=${this.apiKey}`
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Weather data not available, code: ${response.status} -> ${errorData.message}`
      );
    }
    return await response.json();
  }

  async fetchForecastWeather() {
    // const response = await fetch(
    //   `https://api.openweathermap.org/data/2.5/forecast?q=${this.city}&units=${this.units}&appid=${this.apiKey}`
    // );
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${this.lat}&lon=${this.lon}&units=${this.units}&appid=${this.apiKey}`
    );
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Weather data not available, code: ${response.status} -> ${errorData.message}`
      );
    }
    return await response.json();
  }

  async updateWeather() {
    // this.checkAPIKey();
    this.weatherWarningMsg.style.display = "none";
    if (!this.apiKey || !this.lat || !this.lon) {
      this.weatherWarningMsg.textContent = this.errorMsgMissingAPI;
      this.weatherWarningMsg.style.display = "block";
      return;
    }
    try {
      const location = await this.fetchLatlongGeo();
      const data = await this.fetchCurrentWeather();
      const forecastData = await this.fetchForecastWeather();
      this.displayWeather(data, forecastData, location);
    } catch (error) {
      console.error("Error fetching weather data:", error);
      this.weatherWarningMsg.textContent = error;
      this.weatherWarningMsg.style.display = "block";
      // this.descriptionElement.textContent = "Unable to load weather data";
    }
  }

  displayWeather(data, forecastData, location) {
    const { main, weather, wind } = data;

    if (weather != undefined && weather.length > 0) {
      this.weatherTodayData = weather[0];
    }
    // this.dayOfWeekToday.textContent = getDayOfWeek().toUpperCase();

    let today = new Date();
    let dates = [];

    for (let i = 0; i <= 3; i++) {
      let nextDay = new Date(today);
      nextDay.setDate(today.getDate() + i);
      dates.push(getFormattedDateAndDay(nextDay));
    }

    today = dates[0];
    this.dayOfWeekToday.textContent = today.dayOfWeek.toUpperCase();
    // this.dayOfWeekToday.textContent = "Wednesday".toUpperCase(); //
    let currentTempNum = Math.round(Number(main.temp));
    let currentTemp = currentTempNum.toString();
    // If the length is already 3 or more, return the number as it is (with the sign)
    if (currentTemp.length < 3) {
      currentTemp = Math.abs(currentTemp).toString().padStart(2, "0");
      if (currentTempNum < 0) {
        currentTemp = "-" + currentTemp;
      } else {
        currentTemp = "0" + currentTemp;
      }
    }
    this.weatherTodayTemperatureText.textContent = `${currentTemp}°${this.tempUnit}`;
    this.feelsLikeTemperatureText.textContent = `${Math.round(
      main.feels_like
    )}°${this.tempUnit}`;
    this.humidityText.textContent = `${Math.round(main.humidity)}%`;

    this.popText.textContent = `N/A`;
    // wind.speed = 100
    this.windText.textContent = `${wind.speed.toFixed(1)}`; 
    const mainWeather = weather[0].main ?? "clear";
    this.weatherLocationText.textContent = location[0].name ?? "N/A";
    this.weatherTodayConditionText.textContent = mainWeather.toUpperCase();
    fetchSVGIcon(this.weatherConditions[mainWeather.toLowerCase()], this.weatherTodayConditionIcon);


    if (forecastData && this.weatherForecastList && dates.length > 1) {
      const parsedForecastData = parseWeatherData(forecastData);
      if (dates[0].date in parsedForecastData) {
        this.popText.textContent = `${Math.round(
          parsedForecastData[dates[0].date].maxPop * 100
        )}%`;
      }
      // get the today plus next 3 days forecast data from forecastData
      for (let i = 1; i < dates.length; i++) {
        let forecastIndex = i - 1;
        if (dates[i].date in parsedForecastData) {
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastDateText.textContent =
            dates[i].dayOfWeek.toUpperCase();
          this.weatherForecastList[
            forecastIndex
          ].weatherForecaseAvgTemp.style.width =
            parsedForecastData[dates[i].date].avgTemp;
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastTempMinText.textContent =
            Math.round(parsedForecastData[dates[i].date].minTemp).toString() +
            this.degree +
            this.tempUnit;
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastTempMaxText.textContent =
            Math.round(parsedForecastData[dates[i].date].maxTemp).toString() +
            this.degree +
            this.tempUnit;

          let svgPath = "resource/svg/interrobang.svg";
          if (
            parsedForecastData[dates[i].date].weatherCondition.toLowerCase() in
            this.weatherConditions
          ) {
            svgPath =
              this.weatherConditions[
                parsedForecastData[dates[i].date].weatherCondition.toLowerCase()
              ];
          }
          fetchSVGIcon(
            svgPath,
            this.weatherForecastList[forecastIndex].weatherForecastConditionIcon
          );
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastConditionText.textContent =
            parsedForecastData[dates[i].date].weatherCondition.toUpperCase();

          let popRound = Math.round(
            parsedForecastData[dates[i].date].maxPop * 100
          );
          if (popRound >= 100) {
            popRound = 99;
          }
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastPopText.textContent = `${popRound}%`;
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastPopTextBg.textContent = `${popRound}%`;
          const popRoundFill = popRound * 0.85;
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastPopTextBg.style.clipPath = `inset(0 0 ${popRoundFill}% 0)`;
        } else {
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastDateText.textContent =
            dates[i].dayOfWeek.toUpperCase();
          this.weatherForecastList[
            forecastIndex
          ].weatherForecaseAvgTemp.style.width = `0%`;
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastTempMinText.textContent = "N/A";
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastTempMaxText.textContent = "N/A";
          fetchSVGIcon(
            "resource/svg/interrobang.svg",
            this.weatherForecastList[forecastIndex].weatherForecastConditionIcon
          );
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastConditionText.textContent = "N/A";

          this.weatherForecastList[
            forecastIndex
          ].weatherForecastPopText.textContent = "N/A";
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastPopTextBg.textContent = "N/A";
          this.weatherForecastList[
            forecastIndex
          ].weatherForecastPopTextBg.style.clipPath = `inset(0 0 0% 0)`;
        }
      }
    }
  }
}
