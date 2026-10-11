// Makes dist/artifact.html from dist/index.html for publishing as a Claude artifact
// (SPEC section 10). The artifact host wraps the page in its own document skeleton, so
// the copy carries only the page content: title, script, styles and the app root.
// Run from the repo root after "vite build" ("npm run build" does both).

import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const start = html.indexOf('<script');
const end = html.lastIndexOf('</style>') + '</style>'.length;
if (start < 0 || end < '</style>'.length || !html.slice(0, start).includes('<title>ACEN RAP Calculator</title>')) {
  throw new Error('dist/index.html does not look like the single-file build');
}

const page = ['<title>ACEN RAP Calculator</title>', html.slice(start, end), '<main id="app"></main>', ''].join('\n');
writeFileSync('dist/artifact.html', page);
console.log(`dist/artifact.html  ${(page.length / 1024).toFixed(0)} kB`);
