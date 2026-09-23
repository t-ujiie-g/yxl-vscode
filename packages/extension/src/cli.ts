import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import type { Message } from '@yxl-vscode/diag';
import { say } from './text';

const spawn = promisify(execFile);

/** What the compiler did, and what it said about it. */
interface Ran {
  readonly ok: boolean;
  readonly said: string;
}

/** Run `yxl`, or `null` where there is none to run; the compiler is required, not bundled. */
export async function run(binary: string, args: readonly string[]): Promise<Ran | null> {
  try {
    const { stdout, stderr } = await spawn(binary, [...args]);
    return { ok: true, said: `${stdout}${stderr}`.trim() };
  } catch (failure) {
    const { code, stdout, stderr } = failure as {
      code?: string | number;
      stdout?: string;
      stderr?: string;
    };
    if (code === 'ENOENT') return null;

    return { ok: false, said: `${stdout ?? ''}${stderr ?? ''}`.trim() };
  }
}

/** The version out of `yxl version`, which answers `yxl 0.3.6`. */
export function versionOf(said: string): string | null {
  return /(\d+\.\d+\.\d+)/.exec(said)?.[1] ?? null;
}

/** What to say about a compiler that is not the targeted version; neither direction refuses anything. */
export function versionWarning(found: string | null, target: string): Message | null {
  if (found === null) return say('host.version-unknown');
  if (found === target) return null;

  return older(found, target)
    ? say('host.older-compiler', { found, target })
    : say('host.newer-compiler', { found, target });
}

/** Whether the compiler in hand came before the one a command needs. */
export function older(found: string, than: string): boolean {
  return compare(found, than) < 0;
}

function compare(one: string, other: string): number {
  const mine = one.split('.').map(Number);
  const theirs = other.split('.').map(Number);

  for (let at = 0; at < Math.max(mine.length, theirs.length); at += 1) {
    const difference = (mine[at] ?? 0) - (theirs[at] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Where yxl publishes its installers, one per release tag. */
const RELEASES = 'https://raw.githubusercontent.com/t-ujiie-g/yxl';

/** A shell to start, and the one line it runs. */
export interface Installation {
  readonly shell: string;
  readonly args: readonly string[];
  readonly line: string;
}

/**
 * yxl's own installer for exactly `target`, fetched from that release's tag and
 * told the version, so what lands is what the tag says; it checks the download's
 * checksum itself. `into` is the folder to put it in, or `null` for its default.
 */
export function installation(target: string, windows: boolean, into: string | null): Installation {
  if (windows) {
    const quoted = (text: string) => `'${text.replace(/'/g, "''")}'`;
    const dir = into === null ? '' : `$env:YXL_INSTALL_DIR=${quoted(into)}; `;
    const script = quoted(`${RELEASES}/v${target}/install.ps1`);
    return {
      shell: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command'],
      line: `$env:YXL_VERSION=${quoted(target)}; ${dir}irm ${script} | iex`,
    };
  }

  const quoted = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
  const script = quoted(`${RELEASES}/v${target}/install.sh`);
  const dir = into === null ? '' : ` YXL_INSTALL_DIR=${quoted(into)}`;
  return {
    shell: '/bin/sh',
    args: ['-c'],
    line: `(curl -fsSL ${script} || wget -qO- ${script}) | YXL_VERSION=${quoted(target)}${dir} sh`,
  };
}

/**
 * The folder the compiler this editor runs is in: an absolute path's own, or
 * the first on `PATH` that holds it. `null` where there is none to find.
 */
export function folderOf(binary: string, path: string, windows: boolean): string | null {
  if (isAbsolute(binary)) return dirname(binary);

  const names = windows ? [binary, `${binary}.exe`, `${binary}.cmd`] : [binary];
  for (const dir of path.split(delimiter).filter((one) => one !== '')) {
    for (const name of names) {
      try {
        accessSync(join(dir, name), windows ? constants.F_OK : constants.X_OK);
        return dir;
      } catch {
        // Not in this folder; the next one on the path may have it.
      }
    }
  }
  return null;
}
