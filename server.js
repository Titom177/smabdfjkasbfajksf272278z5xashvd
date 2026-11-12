'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { providers } = require('./providers');
const { rank } = require('./rank');
const { isBlocked, resultBlocked } = require('./safety');
const { categories } = require('./categories');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const cache = new Map();
const TTL = 5 * 60e3;

function timeout(p, ms, name) {
  return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`${name} timed out`)), ms))]);
}

async function search({ q, page, sources, sort }) {
  const chosen = providers.filter((p) => !sources.length || sources.includes(p.id));
  const settled = await Promise.allSettled(chosen.map((p) => timeout(p.search(q, page), 10000, p.name)));
  const status = {};
  let all = [];
  settled.forEach((r, i) => {
    const id = chosen[i].id;
    if (r.status === 'fulfilled') { status[id] = { ok: true, count: r.value.length }; all = all.concat(r.value); }
    else status[id] = { ok: false, error: String(r.reason && r.reason.message || r.reason) };
  });
  all = all.filter((v) => !resultBlocked(v));
  return { videos: rank(all, q, sort), status };
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/providers') return send(res, 200, providers.map(({ id, name }) => ({ id, name })));
  if (url.pathname === '/api/categories') return send(res, 200, categories);
  if (url.pathname === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (!q) return send(res, 400, { error: 'Enter a keyword' });
    if (isBlocked(q)) return send(res, 400, { error: 'That search is not allowed.' });
    const page = Math.min(20, Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1));
    const sources = (url.searchParams.get('sources') || '').split(',').filter(Boolean);
    const sort = url.searchParams.get('sort') || 'best';
    const key = JSON.stringify([q.toLowerCase(), page, sources.sort(), sort]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return send(res, 200, hit.data);
    try {
      const data = await search({ q, page, sources, sort });
      cache.set(key, { at: Date.now(), data });
      if (cache.size > 200) cache.delete(cache.keys().next().value);
      return send(res, 200, data);
    } catch (e) { return send(res, 500, { error: 'Search failed' }); }
  }
  const file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, buf) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream'));
}).listen(PORT, () => console.log(`Video search running on http://localhost:${PORT}`));
