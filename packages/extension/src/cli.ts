import { execFile } from 'node:child_process';
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
