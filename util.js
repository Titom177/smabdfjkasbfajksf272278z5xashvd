'use strict';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

const getJson = async (url, opts, ms) => (await fetchWithTimeout(url, opts, ms)).json();
const getText = async (url, opts, ms) => (await fetchWithTimeout(url, opts, ms)).text();

function parseDuration(s) {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  const parts = String(s).split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((a, n) => a * 60 + n, 0);
}

const toInt = (v) => parseInt(String(v ?? '0').replace(/[^\d]/g, ''), 10) || 0;

// Normalise a site's rating to 0..1 (sites use 0-5 or 0-100 scales).
function normRating(r) {
  const n = parseFloat(r);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(1, n > 5 ? n / 100 : n / 5);
}

module.exports = { fetchWithTimeout, getJson, getText, parseDuration, toInt, normRating, UA };
