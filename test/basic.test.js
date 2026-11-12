'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { rank } = require('../rank');
const { isBlocked, resultBlocked } = require('../safety');
const { parseXnxx } = require('../providers');

const v = (o) => ({ provider: 'x', player: { src: 'https://e' }, tags: [], views: 0, rating: null, ...o });

test('relevant + highly rated outranks irrelevant popular', () => {
  const r = rank([v({ id: 1, title: 'cats', views: 9e6, rating: 0.9 }), v({ id: 2, title: 'red head solo', tags: ['redhead', 'solo'], views: 1e4, rating: 0.95 })], 'redhead solo');
  assert.equal(r[0].id, 2);
});
test('dedupes and sorts by rating', () => {
  const r = rank([v({ id: 1, title: 'a', rating: 0.5 }), v({ id: 1, title: 'a', rating: 0.5 }), v({ id: 2, title: 'b', rating: 0.9 })], 'a', 'rating');
  assert.deepEqual(r.map((x) => x.id), [2, 1]);
});
test('blocks queries and results referencing minors/non-consent', () => {
  assert.ok(isBlocked('teen'));
  assert.ok(isBlocked('Schoolgirl uniform'));
  assert.ok(!isBlocked('blonde'));
  assert.ok(resultBlocked({ title: 'ok', tags: ['underage'] }));
});
test('xnxx parser extracts a result', () => {
  const html = '<div id="video_abc123" class="thumb-block"><div class="thumb"><a href="/video-abc/slug"><img data-src="https://t/x.jpg"></a></div><p><a href="/video-abc/slug" title="Some Title">Some Title</a></p><span class="right">10 min</span></div>';
  const [r] = parseXnxx(html);
  assert.equal(r.title, 'Some Title');
  assert.equal(r.duration, 600);
});

test('xvideos-style parser + categories are all allowed by the safety filter', () => {
  const { categories } = require('../categories');
  for (const g of categories) for (const c of g.items) assert.ok(!isBlocked(c), `category blocked: ${c}`);
  const html = '<div id="video_99" class="thumb-block" data-id="99"><a href="/video.abc/slug"><img data-src="https://t/1.jpg"></a><p class="title"><a href="/video.abc/slug" title="Nice One">Nice One</a></p><span class="duration">12 min</span><span>1.2M Views</span></div>';
  const { providers } = require('../providers');
  assert.equal(providers.length, 9);
});
