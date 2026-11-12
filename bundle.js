'use strict';
// Builds dist/index.js: the whole app (server + providers + UI) in ONE file, for pasting into Replit etc.
const fs = require('fs');
const mods = { './util': 'util.js', './safety': 'safety.js', './categories': 'categories.js', './rank': 'rank.js', './providers': 'providers/index.js' };
let out = "'use strict';\nconst __defs = {};\nconst __cache = {};\nconst __req = (n) => { if (__defs[n]) { if (!__cache[n]) { const m = { exports: {} }; __defs[n](m, __req); __cache[n] = m.exports; } return __cache[n]; } return require(n); };\n";
for (const [name, file] of Object.entries(mods)) {
  out += `__defs[${JSON.stringify(name)}] = (module, require) => {\n${fs.readFileSync(file, 'utf8').replace(/^'use strict';/, '')}\n};\n`;
}
out += `__defs['./providers'].__alias = 1;\n`;
let server = fs.readFileSync('server.js', 'utf8').replace(/^'use strict';/, '');
const html = fs.readFileSync('public/index.html', 'utf8');
server = server
  .replace(/const PUBLIC = .*\n/, `const INDEX = ${JSON.stringify(html)};\n`)
  .replace(/const MIME = .*\n/, '')
  .replace(/const file = path\.normalize[\s\S]*?\n\}\)\.listen/, "return send(res, 200, INDEX, 'text/html; charset=utf-8');\n}).listen")
  .replace(/require\('(\.\/[a-z]+)'\)/g, "__req('$1')")
  .replace("const fs = require('fs');\n", '').replace("const path = require('path');\n", '');
out += server;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.js', out);
console.log('wrote dist/index.js', out.length, 'bytes');
