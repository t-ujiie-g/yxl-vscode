import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const view = join(here, '..', 'webview', 'src');

await mkdir(dist, { recursive: true });

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
