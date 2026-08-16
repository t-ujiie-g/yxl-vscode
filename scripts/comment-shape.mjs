// Every comment block in the sources that is longer than AGENTS.md §8.6 allows,
// so a refactoring pass starts from a list rather than a feeling.
//
//   node scripts/comment-shape.mjs           # the list, longest first
//   node scripts/comment-shape.mjs --totals  # the counts alone
//
// The limits are the ones §8.6 states: a doc comment on an export earns up to
// three lines of text, one on anything else a single line, and an inline
// comment two lines. Longer is not forbidden — it is a line in this report, to be
// read and either kept for a reason or cut.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const LIMIT = { export: 5, private: 3, inline: 2 };
const ROOT = join(import.meta.dirname, '..');
const totals = process.argv.includes('--totals');

const files = [];
walk(join(ROOT, 'packages'));
walk(join(ROOT, 'tests'));

const long = [];
const count = { export: [0, 0], private: [0, 0], inline: [0, 0] };

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    let kind;
    let end = i;

    if (line.startsWith('/**')) {
      while (!lines[end].includes('*/')) end += 1;
      const next = (lines[end + 1] ?? '').trim();
      kind = next.startsWith('export ') ? 'export' : 'private';
    } else if (line.startsWith('// ')) {
      while ((lines[end + 1] ?? '').trim().startsWith('// ')) end += 1;
      kind = 'inline';
    } else {
      continue;
    }

    const length = end - i + 1;
    count[kind][0] += 1;
    count[kind][1] += length;
    if (length > LIMIT[kind]) {
      const text = lines
        .slice(i, end + 1)
        .map((one) => one.trim().replace(/^(\/\*\*|\*\/|\*|\/\/)\s?/, ''))
        .filter(Boolean)
        .join(' ');
      long.push({ length, kind, at: `${relative(ROOT, file)}:${i + 1}`, text });
    }
    i = end;
  }
}

if (!totals) {
  long.sort((a, b) => b.length - a.length);
  for (const one of long) {
    console.log(`${String(one.length).padStart(2)}L ${one.kind.padEnd(7)} ${one.at}`);
    console.log(`     ${one.text.slice(0, 110)}${one.text.length > 110 ? '…' : ''}`);
  }
  if (long.length > 0) console.log('');
}

for (const kind of ['export', 'private', 'inline']) {
  const [blocks, lines] = count[kind];
  const average = blocks === 0 ? 0 : (lines / blocks).toFixed(1);
  console.log(
    `${kind.padEnd(7)} ${String(blocks).padStart(4)} blocks ${String(lines).padStart(5)} lines  avg ${average}`,
  );
}
console.log(`over the limit: ${long.length}`);

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') walk(path);
    } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
      files.push(path);
    }
  }
}
