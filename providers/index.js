'use strict';
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
