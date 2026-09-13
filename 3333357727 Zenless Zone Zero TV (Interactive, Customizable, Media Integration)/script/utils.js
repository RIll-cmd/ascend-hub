export function fetchSVGIcon(iconPath, container) {
  fetch(iconPath) // Replace with the path to your SVG file
    .then((response) => response.text())
    .then((svgContent) => {
      container.innerHTML = svgContent;

      // Optionally apply styles or manipulate the SVG
      const svgElement = container.querySelector("svg");
      if (svgElement) {
        svgElement.style.fill = "currentColor"; // Ensures it uses the color from the container
      }
    })
    .catch((error) => console.error("Error loading SVG:", error));
}

export function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

export function getDayOfWeek() {
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const today = new Date();
    const dayOfWeek = today.getDay();
    return daysOfWeek[dayOfWeek];
}


export function aggregateDailyTemperatures(weatherData) {
    const dailyTemperatures = {};

    weatherData.forEach((entry) => {
        const date = entry.dt_txt.split(" ")[0]; // Extract the date part
        const temp = entry.main.temp;

        if (!dailyTemperatures[date]) {
            dailyTemperatures[date] = {
                temps: [],
                minTemp: temp,
                maxTemp: temp,
                pops: [],

            };
        }

        dailyTemperatures[date].temps.push(temp);
        dailyTemperatures[date].minTemp = Math.min(dailyTemperatures[date].minTemp, temp);
        dailyTemperatures[date].maxTemp = Math.max(dailyTemperatures[date].maxTemp, temp);
    });

    const dailyAverages = [];
    for (const date in dailyTemperatures) {
        const temps = dailyTemperatures[date].temps;
        const averageTemp = temps.reduce((sum, temp) => sum + temp, 0) / temps.length;

        dailyAverages.push({
            date,
            averageTemp,
            minTemp: dailyTemperatures[date].minTemp,
            maxTemp: dailyTemperatures[date].maxTemp,
        });
    }

    return dailyAverages;
}


export function getFormattedDateAndDay(date) {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
        date: date.toISOString().split('T')[0],
        dayOfWeek: daysOfWeek[date.getDay()]
    };
}

export function parseWeatherData(data) {
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    let result = {};

    data.list.forEach((item) => {
        const date = item.dt_txt.split(' ')[0];
        const itemDateTime = new Date(item.dt_txt);
        const isToday = date === currentDate;

        if (!result[date]) {
            result[date] = {
                minTemp: item.main.temp_min,
                maxTemp: item.main.temp_max,
                totalTemp: item.main.temp,
                count: 1,
                weatherConditions: [item.weather[0].main],
                maxPop: item.pop, // Track the highest pop value
                mostRecent: itemDateTime > now ? item : null, // Initialize with the closest future item
            };
        } else {
            result[date].minTemp = Math.min(result[date].minTemp, item.main.temp_min);
            result[date].maxTemp = Math.max(result[date].maxTemp, item.main.temp_max);
            result[date].totalTemp += item.main.temp;
            result[date].count += 1;
            result[date].weatherConditions.push(item.weather[0].main);
            result[date].maxPop = Math.max(result[date].maxPop, item.pop); // Update with the highest pop value

            // Update most recent if the current item is closer to now and in the future
            if (itemDateTime > now && (!result[date].mostRecent || itemDateTime < new Date(result[date].mostRecent.dt_txt))) {
                result[date].mostRecent = item;
            }
        }
    });

    let parsedData = {};

    Object.keys(result).forEach((date) => {
        const dayData = result[date];
        const weatherCondition = dayData.weatherConditions.sort((a, b) => {
            const severity = {
                Clear: 1,
                Clouds: 2,
                Mist: 3,
                Haze: 4,
                Fog: 5,
                Drizzle: 6,
                Rain: 7,
                Snow: 8,
                Dust: 9,
                Sand: 10,
                Ash: 11,
                Smoke: 12,
                Squall: 13,
                Thunderstorm: 14,
                Tornado: 15,
            };
            return (severity[b] || 0) - (severity[a] || 0);
        })[0];

        if (date === currentDate && dayData.mostRecent) {
            // Only return the most recent future forecast for today
            const mostRecent = dayData.mostRecent;
            parsedData[date] = {
                minTemp: mostRecent.main.temp_min,
                maxTemp: mostRecent.main.temp_max,
                avgTemp: mostRecent.main.temp,
                weatherCondition: mostRecent.weather[0].main,
                maxPop: mostRecent.pop,
            };
        } else {
            // For other days, return aggregated data
            parsedData[date] = {
                minTemp: dayData.minTemp,
                maxTemp: dayData.maxTemp,
                avgTemp: dayData.totalTemp / dayData.count,
                weatherCondition: weatherCondition,
                maxPop: dayData.maxPop, // Use the highest pop value
            };
        }
    });

    return parsedData;
}
