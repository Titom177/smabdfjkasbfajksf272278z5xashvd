'use strict';
const __defs = {};
const __cache = {};
const __req = (n) => { if (__defs[n]) { if (!__cache[n]) { const m = { exports: {} }; __defs[n](m, __req); __cache[n] = m.exports; } return __cache[n]; } return require(n); };
__defs["./util"] = (module, require) => {

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

};
__defs["./safety"] = (module, require) => {

// Hard content-safety filter. Queries or results that reference minors are
// rejected outright. This is intentionally strict and not user-configurable.
const BLOCKED = [
  'child', 'children', 'kid', 'kids', 'minor', 'underage', 'under age', 'preteen',
  'pre-teen', 'pedo', 'paedo', 'loli', 'lolita', 'shota', 'cp', 'jailbait',
  'toddler', 'infant', 'baby', 'newborn', 'schoolgirl', 'schoolboy', 'student',
  'barely legal', 'young girl', 'young boy', 'little girl', 'little boy', 'tween',
  'teen', 'teens', 'teenager', 'juvenile', 'minors', 'underaged', 'jail bait',
  'daughter', 'son', 'incest', 'rape', 'forced', 'nonconsensual', 'non-consensual',
  'bestiality', 'zoophilia', 'animal sex',
];
const RES = BLOCKED.map((w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[-\s]/g, '[-\\s]?')}([^a-z0-9]|$)`, 'i'));

function isBlocked(text) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  return RES.some((re) => re.test(t));
}

function resultBlocked(v) {
  return isBlocked(v.title) || (v.tags || []).some(isBlocked);
}

module.exports = { isBlocked, resultBlocked };

};
__defs["./categories"] = (module, require) => {

// Category chips. `term` is added to the search keywords.
const categories = [
  { group: 'Popular', items: ['amateur', 'milf', 'lesbian', 'anal', 'blowjob', 'big tits', 'threesome', 'blonde', 'brunette', 'redhead', 'asian', 'latina', 'ebony', 'pov', 'creampie', 'hardcore', 'solo', 'masturbation', 'squirt', 'orgasm', 'cumshot', 'handjob', 'massage', 'outdoor', 'public', 'homemade', 'couple', 'big ass', 'stockings', 'lingerie', 'pornstar', 'compilation', 'gay', 'trans', 'bisexual', 'swinger', 'party'] },
  { group: 'Niche & fetish', items: ['furry', 'fursuit', 'throatpie', 'deepthroat', 'animated', 'hentai', '3d animation', 'cartoon', 'bdsm', 'bondage', 'femdom', 'maledom', 'feet', 'latex', 'leather', 'cosplay', 'cuckold', 'gangbang', 'bukkake', 'facesitting', 'hypno', 'joi', 'asmr', 'tentacle', 'monster girl', 'anthro', 'futanari', 'big cock', 'gagging', 'spanking', 'pegging', 'strapon', 'roleplay', 'lactation', 'pregnant', 'bbw', 'tattoo', 'goth', 'vr', 'sfm', 'blender'] },
];
module.exports = { categories };

};
__defs["./rank"] = (module, require) => {

const tok = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

// Score 0..1: relevance (tag/title match) + rating + popularity.
function score(v, qTokens) {
  const title = new Set(tok(v.title));
  const tags = new Set((v.tags || []).flatMap(tok));
  let rel = 0;
  for (const t of qTokens) rel += Math.min(1, (tags.has(t) ? 0.6 : 0) + (title.has(t) ? 0.6 : 0));
  rel = qTokens.length ? rel / qTokens.length : 0;
  const rating = v.rating ?? 0.6;
  const pop = Math.min(1, Math.log10((v.views || 0) + 1) / 7);
  v.relevance = +rel.toFixed(3);
  return 0.45 * rel + 0.35 * rating + 0.2 * pop;
}

function rank(videos, query, sort = 'best') {
  const q = tok(query);
  const seen = new Set();
  const list = videos.filter((v) => v.player && v.player.src && !seen.has(v.provider + v.id) && seen.add(v.provider + v.id));
  for (const v of list) v.score = +score(v, q).toFixed(4);
  const by = {
    best: (a, b) => b.score - a.score,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.score - a.score,
    views: (a, b) => b.views - a.views,
    relevant: (a, b) => b.relevance - a.relevance || b.score - a.score,
  }[sort] || ((a, b) => b.score - a.score);
  return list.sort(by);
}
module.exports = { rank, tok };

};
__defs["./providers"] = (module, require) => {

const { getJson, getText, parseDuration, toInt, normRating } = require('../util');

const enc = encodeURIComponent;
const tagList = (t) => (t || []).map((x) => (typeof x === 'string' ? x : x.tag_name || x.name)).filter(Boolean);

// Each provider: { id, name, search(query, page) -> [video] }.
// video: { provider, id, title, thumb, duration, views, rating(0..1|null), tags[], pageUrl, player: {type:'iframe'|'video', src, poster?} }

// ---- Sites with public "webmasters" JSON APIs -------------------------------
const pornhub = {
  id: 'pornhub', name: 'Pornhub',
  async search(q, page) {
    const j = await getJson(`https://www.pornhub.com/webmasters/search?search=${enc(q)}&page=${page}&thumbsize=large_hd&ordering=mostviewed`);
    return (j.videos || []).map((v) => ({
      provider: 'pornhub', id: v.video_id, title: v.title,
      thumb: v.default_thumb || v.thumb, duration: parseDuration(v.duration),
      views: toInt(v.views), rating: normRating(v.rating), tags: tagList(v.tags),
      pageUrl: v.url, player: { type: 'iframe', src: `https://www.pornhub.com/embed/${v.video_id}` },
    }));
  },
};

const redtube = {
  id: 'redtube', name: 'RedTube',
  async search(q, page) {
    const j = await getJson(`https://api.redtube.com/?data=redtube.Videos.searchVideos&output=json&search=${enc(q)}&page=${page}&thumbsize=big&ordering=rating`);
    return (j.videos || []).map(({ video: v }) => ({
      provider: 'redtube', id: v.video_id, title: v.title,
      thumb: v.default_thumb || v.thumb, duration: parseDuration(v.duration),
      views: toInt(v.views), rating: normRating(v.rating), tags: tagList(v.tags),
      pageUrl: v.url, player: { type: 'iframe', src: `https://embed.redtube.com/?id=${v.video_id}` },
    }));
  },
};

const youporn = {
  id: 'youporn', name: 'YouPorn',
  async search(q, page) {
    const j = await getJson(`https://www.youporn.com/api/webmasters/search?search=${enc(q)}&page=${page}&thumbsize=big&ordering=rating`);
    return (j.videos || []).map((v) => ({
      provider: 'youporn', id: String(v.video_id), title: v.title,
      thumb: v.default_thumb || v.thumb, duration: parseDuration(v.duration),
      views: toInt(v.views), rating: normRating(v.rating), tags: tagList(v.tags),
      pageUrl: v.url, player: { type: 'iframe', src: `https://www.youporn.com/embed/${v.video_id}/` },
    }));
  },
};

// ---- XNXX: no public API, so we parse the search results HTML (best effort) -
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function parseXnxx(html) {
  const out = [];
  const blocks = html.split(/<div id="video_/).slice(1);
  for (const b of blocks) {
    const id = (b.match(/^(\w+)"/) || [])[1];
    const href = (b.match(/<a href="(\/video-[^"]+)"/) || [])[1];
    const title = (b.match(/<a href="\/video-[^"]+"[^>]*title="([^"]+)"/) || b.match(/<p><a href="\/video-[^"]+"[^>]*>([^<]+)</) || [])[1];
    const thumb = (b.match(/data-src="([^"]+)"/) || [])[1];
    if (!id || !href || !title) continue;
    const dur = (b.match(/<span class="right">\s*([\d:hmin sec]+?)\s*</i) || b.match(/(\d+)\s*min/i) || [])[0] || '';
    const views = (b.match(/([\d.,]+[KM]?)\s*<span class="superfluous">/) || [])[1] || '0';
    const mult = /M$/i.test(views) ? 1e6 : /K$/i.test(views) ? 1e3 : 1;
    const minutes = (dur.match(/(\d+)\s*min/i) || [])[1];
    const hours = (dur.match(/(\d+)\s*h/i) || [])[1];
    const pct = (b.match(/(\d{1,3})%/) || [])[1];
    out.push({
      provider: 'xnxx', id, title: decode(title), thumb, duration: (+hours || 0) * 3600 + (+minutes || 0) * 60,
      views: Math.round(parseFloat(views.replace(/,/g, '')) * mult) || 0,
      rating: pct ? Math.min(1, +pct / 100) : null, tags: [],
      pageUrl: `https://www.xnxx.com${href}`, player: { type: 'iframe', src: `https://www.xnxx.com/embedframe/${id.replace(/^\D*/, '')}` },
    });
  }
  return out;
}

const xnxx = {
  id: 'xnxx', name: 'XNXX',
  async search(q, page) {
    const html = await getText(`https://www.xnxx.com/search/${enc(q)}/${Math.max(0, page - 1)}`);
    return parseXnxx(html);
  },
};

// ---- RedGifs: public v2 API using a temporary token; direct MP4 playback ----
let rgToken = { value: null, at: 0 };
async function redgifsToken() {
  if (rgToken.value && Date.now() - rgToken.at < 20 * 60e3) return rgToken.value;
  const j = await getJson('https://api.redgifs.com/v2/auth/temporary');
  rgToken = { value: j.token, at: Date.now() };
  return rgToken.value;
}
const redgifs = {
  id: 'redgifs', name: 'RedGifs',
  async search(q, page) {
    const token = await redgifsToken();
    const j = await getJson(`https://api.redgifs.com/v2/gifs/search?search_text=${enc(q)}&order=best&count=40&page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
    return (j.gifs || []).map((g) => ({
      provider: 'redgifs', id: g.id, title: g.description || (g.tags || []).slice(0, 4).join(', ') || g.id,
      thumb: g.urls.poster || g.urls.thumbnail, duration: Math.round(g.duration || 0),
      views: toInt(g.views), rating: g.views > 50 ? Math.min(1, (g.likes / g.views) * 8) : null, tags: g.tags || [],
      pageUrl: `https://www.redgifs.com/watch/${g.id}`,
      player: { type: 'video', src: g.urls.hd || g.urls.sd, poster: g.urls.poster },
    }));
  },
};


// ---- XVideos: same HTML template family as XNXX ------------------------------
function parseThumbBlocks(html, { provider, base, embed }) {
  const out = [];
  for (const b of html.split(/<div id="video_/).slice(1)) {
    const id = (b.match(/data-id="(\d+)"/) || b.match(/^(\d+)"/) || [])[1];
    const href = (b.match(/<a href="(\/video[^"]+)"/) || [])[1];
    const title = (b.match(/<a href="\/video[^"]+"[^>]*title="([^"]+)"/) || b.match(/<p[^>]*><a href="\/video[^"]+"[^>]*>([^<]+)</) || [])[1];
    if (!id || !href || !title) continue;
    const thumb = (b.match(/data-src="([^"]+)"/) || [])[1];
    const dur = (b.match(/class="duration">([^<]+)</) || [])[1] || '';
    const mins = (dur.match(/(\d+)\s*min/i) || [])[1], hrs = (dur.match(/(\d+)\s*h/i) || [])[1];
    const views = (b.match(/([\d.,]+\s*[KM]?)\s*Views/i) || [])[1] || '0';
    const mult = /M/i.test(views) ? 1e6 : /K/i.test(views) ? 1e3 : 1;
    const pct = (b.match(/(\d{1,3})%/) || [])[1];
    out.push({
      provider, id, title: decode(title), thumb, duration: (+hrs || 0) * 3600 + (+mins || 0) * 60,
      views: Math.round(parseFloat(views.replace(/[,\sKM]/gi, '')) * mult) || 0,
      rating: pct ? Math.min(1, +pct / 100) : null, tags: [], pageUrl: base + href, player: { type: 'iframe', src: embed(id) },
    });
  }
  return out;
}
const xvideos = {
  id: 'xvideos', name: 'XVideos',
  async search(q, page) {
    const html = await getText(`https://www.xvideos.com/?k=${enc(q)}&p=${Math.max(0, page - 1)}&sort=rating`);
    return parseThumbBlocks(html, { provider: 'xvideos', base: 'https://www.xvideos.com', embed: (id) => `https://www.xvideos.com/embedframe/${id}` });
  },
};

// ---- xHamster: video list is embedded as JSON (window.initials) --------------
const xhamster = {
  id: 'xhamster', name: 'xHamster',
  async search(q, page) {
    const html = await getText(`https://xhamster.com/search/${enc(q)}?page=${page}`);
    const m = html.match(/window\.initials\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
    if (!m) throw new Error('unexpected page (blocked?)');
    const j = JSON.parse(m[1]);
    const list = (j.searchResult && j.searchResult.videoThumbProps) || [];
    return list.map((v) => ({
      provider: 'xhamster', id: String(v.id), title: v.title, thumb: v.thumbURL || v.imageURL,
      duration: parseDuration(v.duration), views: toInt(v.views), rating: null, tags: [],
      pageUrl: v.pageURL, player: { type: 'iframe', src: `https://xhamster.com/xembed.php?video=${v.id}` },
    }));
  },
};

// ---- Eporner: public JSON API -------------------------------------------------
const eporner = {
  id: 'eporner', name: 'Eporner',
  async search(q, page) {
    const j = await getJson(`https://www.eporner.com/api/v2/video/search/?query=${enc(q)}&per_page=40&page=${page}&thumbsize=big&order=top-rated&format=json`);
    return (j.videos || []).map((v) => ({
      provider: 'eporner', id: v.id, title: v.title, thumb: v.default_thumb && v.default_thumb.src,
      duration: v.length_sec || 0, views: toInt(v.views), rating: normRating(v.rate),
      tags: String(v.keywords || '').split(',').map((t) => t.trim()).filter(Boolean),
      pageUrl: v.url, player: { type: 'iframe', src: `https://www.eporner.com/embed/${v.id}/` },
    }));
  },
};

// ---- e621: furry / fursuit / animated. Public JSON API, direct video files ----
const e621 = {
  id: 'e621', name: 'e621 (furry/animated)',
  async search(q, page) {
    const tags = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
    const j = await getJson(`https://e621.net/posts.json?tags=${enc(tags + ' rating:explicit order:score')}&limit=75&page=${page}`);
    return (j.posts || []).filter((p) => ['webm', 'mp4'].includes(p.file.ext) && p.file.url).map((p) => ({
      provider: 'e621', id: String(p.id), title: (p.tags.artist || []).slice(0, 2).join(', ') ? `${(p.tags.artist || []).slice(0, 2).join(', ')} — ${(p.tags.species || [])[0] || p.tags.general.slice(0, 3).join(' ')}` : p.tags.general.slice(0, 5).join(' '),
      thumb: p.preview.url || p.sample.url, duration: Math.round(p.duration || 0),
      views: (p.fav_count || 0) * 20, rating: null,
      tags: [...p.tags.general, ...(p.tags.species || []), ...(p.tags.character || [])].slice(0, 80),
      pageUrl: `https://e621.net/posts/${p.id}`, player: { type: 'video', src: p.file.url, poster: p.sample.url || p.preview.url },
    }));
  },
};

const providers = [pornhub, redtube, youporn, xnxx, xvideos, xhamster, eporner, redgifs, e621];
module.exports = { providers, parseXnxx };

};
__defs['./providers'].__alias = 1;

const http = require('http');
const { providers } = __req('./providers');
const { rank } = __req('./rank');
const { isBlocked, resultBlocked } = __req('./safety');
const { categories } = __req('./categories');

const PORT = process.env.PORT || 3000;
const INDEX = "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>AfterDark Search</title>\n<style>\n:root{--bg:#0e0e12;--card:#191920;--fg:#ececf1;--mut:#9a9aa8;--acc:#ff4d6d;--bd:#2a2a35}\n*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px system-ui,sans-serif}\nheader{position:sticky;top:0;background:var(--bg);padding:14px 16px;border-bottom:1px solid var(--bd);z-index:5}\nh1{font-size:18px;margin:0 0 10px}h1 span{color:var(--acc)}\nform{display:flex;gap:8px;flex-wrap:wrap}\ninput[type=search]{flex:1;min-width:200px;padding:10px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--card);color:var(--fg);font-size:15px}\nbutton,select{padding:10px 14px;border-radius:8px;border:1px solid var(--bd);background:var(--card);color:var(--fg);cursor:pointer;font-size:14px}\nbutton.go{background:var(--acc);border-color:var(--acc);font-weight:600}\n.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}\n.chips label{padding:5px 10px;border:1px solid var(--bd);border-radius:99px;cursor:pointer;color:var(--mut);user-select:none}\n.chips input{display:none}.cat{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;max-height:84px;overflow:auto}.cat b{width:100%;font-size:12px;color:var(--mut)}.cat button{padding:4px 10px;border-radius:99px;font-size:13px;color:var(--mut)}.cat button.on{background:var(--acc);border-color:var(--acc);color:#fff}.chips label:has(input:checked){background:var(--acc);border-color:var(--acc);color:#fff}\n.chips .bad{outline:1px solid #b33}\n#status{padding:8px 16px;color:var(--mut);font-size:13px}\n#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;padding:0 16px 20px}\n.card{background:var(--card);border-radius:10px;overflow:hidden;cursor:pointer;border:1px solid var(--bd)}\n.card:hover{border-color:var(--acc)}\n.th{position:relative;aspect-ratio:16/9;background:#000}.th img{width:100%;height:100%;object-fit:cover;display:block}\n.dur,.src{position:absolute;bottom:6px;padding:2px 6px;border-radius:4px;background:#000c;font-size:12px}.dur{right:6px}.src{left:6px;color:var(--acc)}\n.info{padding:8px 10px}.t{font-weight:600;line-height:1.3;max-height:2.6em;overflow:hidden}.m{color:var(--mut);font-size:12px;margin-top:4px}\n#more{display:block;margin:0 auto 30px}\n#gate,#modal{position:fixed;inset:0;background:#000d;display:none;align-items:center;justify-content:center;z-index:20;padding:16px}\n#gate{display:flex;background:var(--bg)}#gate div{max-width:420px;text-align:center}\n#modal .box{width:min(1100px,100%);background:var(--card);border-radius:10px;overflow:hidden}\n.player{aspect-ratio:16/9;background:#000}.player iframe,.player video{width:100%;height:100%;border:0}\n.bar{display:flex;justify-content:space-between;gap:10px;padding:10px 14px;align-items:center}.bar a{color:var(--acc)}\n</style></head><body>\n<div id=\"gate\"><div><h1>AfterDark <span>Search</span></h1><p>This site contains sexually explicit material. You must be 18 or older (or the age of majority where you live) to enter.</p>\n<button class=\"go\" id=\"yes\">I am 18+ — Enter</button> <button id=\"no\">Leave</button></div></div>\n<header><h1>AfterDark <span>Search</span></h1>\n<form id=\"f\"><input type=\"search\" id=\"q\" placeholder=\"Keywords and/or pick categories below…\" autocomplete=\"off\">\n<select id=\"sort\"><option value=\"best\">Best match</option><option value=\"rating\">Top rated</option><option value=\"relevant\">Most relevant</option><option value=\"views\">Most viewed</option></select>\n<button class=\"go\">Search</button></form><div class=\"chips\" id=\"chips\"></div><div id=\"cats\"></div></header>\n<div id=\"status\">Search to begin.</div><div id=\"grid\"></div><button id=\"more\" hidden>Load more</button>\n<div id=\"modal\"><div class=\"box\"><div class=\"player\" id=\"player\"></div><div class=\"bar\"><div id=\"ptitle\"></div><span><a id=\"plink\" target=\"_blank\" rel=\"noopener noreferrer\">Open on site ↗</a> · <button id=\"close\">Close</button></span></div></div></div>\n<script>\nconst $=s=>document.querySelector(s);let page=1,lastQ='',provs=[];\nconst ok=()=>{try{return localStorage.getItem('age18')==='1'}catch{return false}};\nif(ok())$('#gate').style.display='none';\n$('#yes').onclick=()=>{try{localStorage.setItem('age18','1')}catch{}$('#gate').style.display='none'};\n$('#no').onclick=()=>location.href='https://www.google.com';\nfetch('/api/providers').then(r=>r.json()).then(p=>{provs=p;$('#chips').innerHTML=p.map(x=>`<label data-id=\"${x.id}\"><input type=\"checkbox\" value=\"${x.id}\" checked>${x.name}</label>`).join('')});\nconst sel=new Set();\nfetch('/api/categories').then(r=>r.json()).then(g=>{$('#cats').innerHTML=g.map(x=>`<div class=\"cat\"><b>${esc(x.group)}</b>${x.items.map(i=>`<button type=\"button\" data-c=\"${esc(i)}\">${esc(i)}</button>`).join('')}</div>`).join('')});\n$('#cats').onclick=e=>{const b=e.target.closest('button');if(!b)return;const c=b.dataset.c;sel.has(c)?sel.delete(c):sel.add(c);b.classList.toggle('on');$('#f').requestSubmit()};\nconst fmt=s=>{s=+s||0;const h=s/3600|0,m=(s%3600)/60|0,x=s%60;return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0')};\nconst esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst safeUrl=u=>/^https:\\/\\//.test(u)?u:'';\nlet vids=[];\nasync function run(reset){\n  if(reset){page=1;vids=[];$('#grid').innerHTML='';}\n  const src=[...document.querySelectorAll('#chips input:checked')].map(i=>i.value).join(',');\n  $('#status').textContent='Searching…';\n  const r=await fetch(`/api/search?q=${encodeURIComponent(lastQ)}&page=${page}&sort=${$('#sort').value}&sources=${src}`);\n  const d=await r.json();\n  if(!r.ok){$('#status').textContent=d.error;return}\n  document.querySelectorAll('.chips label').forEach(l=>{const s=d.status[l.dataset.id];l.classList.toggle('bad',!!s&&!s.ok);l.title=s?(s.ok?s.count+' results':s.error):''});\n  const start=vids.length;vids=vids.concat(d.videos);\n  $('#grid').insertAdjacentHTML('beforeend',d.videos.map((v,i)=>`<div class=\"card\" data-i=\"${start+i}\"><div class=\"th\"><img loading=\"lazy\" src=\"${esc(safeUrl(v.thumb))}\" alt=\"\"><span class=\"src\">${esc(v.provider)}</span><span class=\"dur\">${fmt(v.duration)}</span></div><div class=\"info\"><div class=\"t\">${esc(v.title)}</div><div class=\"m\">${v.rating!=null?'★ '+Math.round(v.rating*100)+'% · ':''}${(v.views||0).toLocaleString()} views</div></div></div>`).join(''));\n  const failed=Object.entries(d.status).filter(([,s])=>!s.ok).map(([k])=>k);\n  $('#status').textContent=`${vids.length} videos`+(failed.length?` · unavailable: ${failed.join(', ')}`:'');\n  $('#more').hidden=!d.videos.length;\n}\n$('#f').onsubmit=e=>{e.preventDefault();lastQ=[$('#q').value.trim(),...sel].filter(Boolean).join(' ');if(!lastQ){$('#status').textContent='Enter a keyword or pick a category';return}run(true)};\n$('#more').onclick=()=>{page++;run(false)};\n$('#grid').onclick=e=>{const c=e.target.closest('.card');if(!c)return;const v=vids[c.dataset.i],p=v.player,u=safeUrl(p.src);if(!u)return;\n  $('#player').innerHTML=p.type==='video'?`<video src=\"${esc(u)}\" poster=\"${esc(safeUrl(p.poster))}\" controls autoplay loop playsinline></video>`:`<iframe src=\"${esc(u)}\" allow=\"autoplay; fullscreen\" allowfullscreen referrerpolicy=\"no-referrer\" sandbox=\"allow-scripts allow-same-origin allow-presentation\"></iframe>`;\n  $('#ptitle').textContent=v.title;$('#plink').href=safeUrl(v.pageUrl);$('#modal').style.display='flex'};\nconst closeM=()=>{$('#modal').style.display='none';$('#player').innerHTML=''};\n$('#close').onclick=closeM;$('#modal').onclick=e=>{if(e.target.id==='modal')closeM()};\n</script></body></html>\n";
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
  return send(res, 200, INDEX, 'text/html; charset=utf-8');
}).listen(PORT, () => console.log(`Video search running on http://localhost:${PORT}`));
