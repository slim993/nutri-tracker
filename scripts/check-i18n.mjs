// Fails when a French string passed to t() has no English entry in src/app/core/i18n.en.ts.
// Only string literals can be checked; keys built at runtime (seed names, dbTry labels,
// programme templates) are listed in that file by hand.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'src', 'app');
const dictionary = readFileSync(join(root, 'core', 'i18n.en.ts'), 'utf8');

// Keys of the EN object: quoted either way, or bare when Prettier found the quotes unnecessary.
const entry = /^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([\p{L}_$][\p{L}\p{N}_$]*)):/gmu;
const translated = new Set(
  [...dictionary.matchAll(entry)].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\(['"])/g, '$1')),
);

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.(ts|html)$/.test(entry.name) && !/\.spec\.ts$|i18n(\.en)?\.ts$/.test(entry.name)) {
      yield path;
    }
  }
}

const literal = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const missing = new Map();
let total = 0;
for (const path of sources(root)) {
  for (const match of readFileSync(path, 'utf8').matchAll(literal)) {
    const key = (match[1] ?? match[2]).replace(/\\(['"])/g, '$1');
    total++;
    if (!translated.has(key)) missing.set(key, path);
  }
}

if (missing.size > 0) {
  console.error(`${missing.size} string(s) without an English translation:`);
  for (const [key, path] of missing) console.error(`  ${JSON.stringify(key)}  (${path})`);
  process.exit(1);
}
console.log(`i18n: ${total} t() calls, all translated.`);
