'use strict';

const express = require('express');
const router = express.Router();

// Thành phố lấy từ .env, mặc định Hồ Chí Minh
const CITY = process.env.WEATHER_CITY || 'Ho Chi Minh';

// Cache trong bộ nhớ để tránh gọi API liên tục (nhẹ cho server nhỏ)
const CACHE_MS = 10 * 60 * 1000; // 10 phút
let cache = { at: 0, data: null };
let geo = null; // { lat, lon, name } — geocode 1 lần rồi nhớ

// Mã thời tiết WMO -> mô tả tiếng Việt + emoji
function describe(code) {
  const map = {
    0: ['Trời quang', '☀️'],
    1: ['Ít mây', '🌤️'],
    2: ['Có mây', '⛅'],
    3: ['Nhiều mây', '☁️'],
    45: ['Sương mù', '🌫️'],
    48: ['Sương mù đóng băng', '🌫️'],
    51: ['Mưa phùn nhẹ', '🌦️'],
    53: ['Mưa phùn', '🌦️'],
    55: ['Mưa phùn dày', '🌦️'],
    61: ['Mưa nhẹ', '🌧️'],
    63: ['Mưa', '🌧️'],
    65: ['Mưa to', '🌧️'],
    66: ['Mưa lạnh', '🌧️'],
    67: ['Mưa lạnh to', '🌧️'],
    71: ['Tuyết nhẹ', '🌨️'],
    73: ['Tuyết', '🌨️'],
    75: ['Tuyết dày', '🌨️'],
    77: ['Hạt tuyết', '🌨️'],
    80: ['Mưa rào nhẹ', '🌦️'],
    81: ['Mưa rào', '🌧️'],
    82: ['Mưa rào dữ dội', '⛈️'],
    85: ['Mưa tuyết nhẹ', '🌨️'],
    86: ['Mưa tuyết', '🌨️'],
    95: ['Dông', '⛈️'],
    96: ['Dông kèm mưa đá', '⛈️'],
    99: ['Dông kèm mưa đá lớn', '⛈️'],
  };
  return map[code] || ['Không rõ', '🌡️'];
}

// Geocode tên thành phố -> toạ độ (gọi 1 lần, cache lâu dài)
async function geocode() {
  if (geo) return geo;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    CITY
  )}&count=1&language=vi&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Geocode lỗi ' + res.status);
  const json = await res.json();
  const r = json.results && json.results[0];
  if (!r) throw new Error('Không tìm thấy thành phố: ' + CITY);
  geo = { lat: r.latitude, lon: r.longitude, name: r.name };
  return geo;
}

// GET /api/weather — trả thời tiết hiện tại của thành phố cấu hình
router.get('/', async (req, res) => {
  try {
    // Trả cache nếu còn hạn (không dùng Date.now trong sandbox nhưng đây là runtime thật)
    const now = Date.now();
    if (cache.data && now - cache.at < CACHE_MS) {
      return res.json(cache.data);
    }

    const g = await geocode();
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`;
    const wRes = await fetch(url);
    if (!wRes.ok) throw new Error('Weather API lỗi ' + wRes.status);
    const w = await wRes.json();
    const cur = w.current || {};
    const [desc, icon] = describe(cur.weather_code);

    // Dự báo 7 ngày
    const d = w.daily || {};
    const daily = (d.time || []).map((date, i) => {
      const [dDesc, dIcon] = describe(d.weather_code ? d.weather_code[i] : undefined);
      return {
        date,
        code: d.weather_code ? d.weather_code[i] : null,
        icon: dIcon,
        description: dDesc,
        tmax: d.temperature_2m_max ? Math.round(d.temperature_2m_max[i]) : null,
        tmin: d.temperature_2m_min ? Math.round(d.temperature_2m_min[i]) : null,
      };
    });

    const data = {
      city: g.name,
      temperature: cur.temperature_2m,
      humidity: cur.relative_humidity_2m,
      windSpeed: cur.wind_speed_10m,
      code: cur.weather_code,
      description: desc,
      icon,
      time: cur.time,
      daily,
    };

    cache = { at: now, data };
    res.json(data);
  } catch (err) {
    console.error('[weather]', err.message);
    res.status(502).json({ error: 'Không lấy được thời tiết' });
  }
});

module.exports = router;
