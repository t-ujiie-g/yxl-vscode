import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const view = join(here, '..', 'webview', 'src');

await mkdir(dist, { recursive: true });

// The yxl this extension targets is pinned in one place (ROADMAP §8 Q6). The
// bundle cannot read that file at runtime, so the value is compiled in.
const manifest = JSON.parse(await readFile(join(here, '..', '..', 'package.json'), 'utf8'));
const target = manifest.yxl.targetVersion;

// The extension host loads CommonJS and provides `vscode` itself; everything
// else is bundled, because a VS Code extension ships as one file.
await build({
  entryPoints: [join(here, 'src', 'extension.ts')],
  outfile: join(dist, 'extension.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode'],
  define: { YXL_TARGET: JSON.stringify(target) },
  sourcemap: true,
});

await build({
  entryPoints: [join(view, 'index.ts')],
  outfile: join(dist, 'webview.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2023',
  sourcemap: true,
});

await copyFile(join(view, 'view.css'), join(dist, 'webview.css'));
