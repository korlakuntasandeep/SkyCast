/* script.js - improved + debug-friendly
   1) Replace YOUR_API_KEY with your OpenWeatherMap API key.
   2) Serve files via HTTP (e.g. `python -m http.server`) — do NOT open index.html via file://
*/

const API_KEY = "E29f656d1c2c15e56059f659f6d4343c"; // <-- put your API key here

// Helper to get UI elements
const infoEl = () => document.getElementById("weather-info");
const forecastEl = () => document.getElementById("forecast");
const searchBtn = () => document.querySelector(".search-box button");

async function getCoordinates() {
  const cityInput = document.getElementById("city");
  const city = (cityInput.value || "").trim();
  infoEl().innerHTML = "";
  forecastEl().innerHTML = "";

  if (!city) {
    infoEl().innerHTML = `<p style="color:#ff4d4d;">Please enter a city or town name.</p>`;
    return;
  }

  // disable button while loading
  const btn = searchBtn();
  btn.disabled = true;
  btn.textContent = "Searching...";

  try {
    infoEl().innerHTML = `<p>Finding location for <b>${escapeHtml(city)}</b>…</p>`;

    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`;
    const geoResp = await fetch(geoUrl);

    if (!geoResp.ok) {
      // helpful messages for common statuses
      if (geoResp.status === 401) throw new Error("Invalid API key (401). Check your API key.");
      if (geoResp.status === 429) throw new Error("Too many requests (429). You may have exceeded your API quota.");
      throw new Error(`Geocoding failed: ${geoResp.status} ${geoResp.statusText}`);
    }

    const geoData = await geoResp.json();
    if (!Array.isArray(geoData) || geoData.length === 0) {
      infoEl().innerHTML = `<p style="color:#ff4d4d;">City/Town not found. Try more precise input (e.g. "Paris, FR" or "Springfield, US").</p>`;
      return;
    }

    const { lat, lon, name: cityName, country } = geoData[0];
    await getWeather(lat, lon, cityName, country);
    await getForecast(lat, lon);

  } catch (err) {
    console.error("getCoordinates error:", err);
    infoEl().innerHTML = `<p style="color:red;">Error: ${escapeHtml(err.message)}</p>`;
    forecastEl().innerHTML = "";
  } finally {
    btn.disabled = false;
    btn.textContent = "Search";
  }
}

async function getWeather(lat, lon, cityName, country) {
  try {
    infoEl().innerHTML = `<p>Loading current weather…</p>`;
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const resp = await fetch(weatherUrl);

    if (!resp.ok) {
      if (resp.status === 401) throw new Error("Invalid API key (401).");
      if (resp.status === 429) throw new Error("Too many requests (429).");
      const text = await resp.text();
      throw new Error(`Weather API error: ${resp.status} ${text}`);
    }

    const data = await resp.json();

    const temp = (data && data.main && Math.round(data.main.temp)) ?? "N/A";
    const desc = (data && data.weather && data.weather[0] && data.weather[0].description) || "N/A";
    const icon = (data && data.weather && data.weather[0] && data.weather[0].icon) || "";
    const humidity = data?.main?.humidity ?? "N/A";
    const wind = data?.wind?.speed ?? "N/A";

    infoEl().innerHTML = `
      <h3>${escapeHtml(cityName)}, ${escapeHtml(country)}</h3>
      ${icon ? `<img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${escapeHtml(desc)}">` : ""}
      <p>🌡 Temperature: ${temp} °C</p>
      <p>☁ Condition: ${escapeHtml(desc)}</p>
      <p>💧 Humidity: ${humidity}%</p>
      <p>💨 Wind Speed: ${wind} m/s</p>
    `;

    setBackgroundByDescription(desc);

  } catch (err) {
    console.error("getWeather error:", err);
    infoEl().innerHTML = `<p style="color:red;">Error fetching weather: ${escapeHtml(err.message)}</p>`;
  }
}

async function getForecast(lat, lon) {
  try {
    forecastEl().innerHTML = `<p>Loading 5-day forecast…</p>`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const resp = await fetch(forecastUrl);

    if (!resp.ok) {
      if (resp.status === 401) throw new Error("Invalid API key (401).");
      if (resp.status === 429) throw new Error("Too many requests (429).");
      const text = await resp.text();
      throw new Error(`Forecast API error: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    if (!data.list || !Array.isArray(data.list) || data.list.length === 0) {
      forecastEl().innerHTML = `<p style="color:#ff4d4d;">No forecast data available.</p>`;
      return;
    }

    // Build best single item per day (closest to 12:00)
    const seenDates = [];
    const dayBest = {}; // date -> {item, diff}
    data.list.forEach(item => {
      const [datePart, timePart] = item.dt_txt.split(" ");
      if (!seenDates.includes(datePart)) seenDates.push(datePart);
      const hour = parseInt(timePart.split(":")[0], 10);
      const diff = Math.abs(hour - 12); // closeness to noon
      if (!dayBest[datePart] || diff < dayBest[datePart].diff) {
        dayBest[datePart] = { item, diff };
      }
    });

    // take the next up to 5 unique dates (usually includes today)
    const dailyItems = seenDates.map(d => dayBest[d].item).slice(0, 5);

    // Render forecast cards
    let html = "";
    dailyItems.forEach(day => {
      const date = new Date(day.dt_txt);
      const options = { weekday: "short", month: "short", day: "numeric" };
      const dayName = date.toLocaleDateString(undefined, options);

      const icon = day.weather?.[0]?.icon || "";
      const description = day.weather?.[0]?.description || "";
      const temp = day.main ? Math.round(day.main.temp) : "N/A";

      html += `
        <div class="forecast-card">
          <p><b>${escapeHtml(dayName)}</b></p>
          ${icon ? `<img src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${escapeHtml(description)}">` : ""}
          <p>${temp} °C</p>
          <p style="font-size:12px">${escapeHtml(description)}</p>
        </div>
      `;
    });

    forecastEl().innerHTML = html;

  } catch (err) {
    console.error("getForecast error:", err);
    forecastEl().innerHTML = `<p style="color:red;">Error fetching forecast: ${escapeHtml(err.message)}</p>`;
  }
}

/* Utility: set background based on description */
function setBackgroundByDescription(desc = "") {
  const d = (desc || "").toLowerCase();
  if (d.includes("cloud")) {
    document.body.style.background = "linear-gradient(120deg, #bdc3c7, #2c3e50)";
  } else if (d.includes("rain") || d.includes("drizzle") || d.includes("thunder")) {
    document.body.style.background = "linear-gradient(120deg, #373B44, #4286f4)";
  } else if (d.includes("clear") || d.includes("sun")) {
    document.body.style.background = "linear-gradient(120deg, #fbc531, #e1b12c)";
  } else if (d.includes("snow")) {
    document.body.style.background = "linear-gradient(120deg, #83a4d4, #b6fbff)";
  } else {
    document.body.style.background = "linear-gradient(120deg, #74ebd5, #ACB6E5)";
  }
}

/* Small helper to escape HTML in inserted strings */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
Object.keys(daily).slice(0, 5).forEach((day, i) => {
  const item = daily[day];
  const cond = item.weather[0].main.toLowerCase();
  const description = item.weather[0].description; // <-- add description
  const temp = Math.round(item.main.temp);
  const humidity = item.main.humidity;
  const wind = item.wind.speed;
  const rain = item.rain ? item.rain["3h"] || item.rain["1h"] || 0 : 0;

  forecastBox.innerHTML += `
    <div class="day" style="animation-delay:${i * 0.2}s">
      <h3>${day}</h3>
      ${miniIconHTML(cond)}
      <div class="temp">${temp}°C</div>
      <p class="desc">${description}</p>   <!-- 👈 description shown -->
      <div class="extra-small">
        <p>💧 ${humidity}%</p>
        <p>🌬 ${wind} m/s</p>
        <p>🌧 ${rain} mm</p>
      </div>
    </div>
  `;
});
