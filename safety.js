'use strict';
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
