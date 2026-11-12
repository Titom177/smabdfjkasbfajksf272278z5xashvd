'use strict';
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
