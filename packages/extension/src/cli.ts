import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const spawn = promisify(execFile);

/** What the compiler did, and what it said about it. */
export interface Ran {
  readonly ok: boolean;
  readonly said: string;
}

/**
 * Run `yxl`, or `null` when there is no `yxl` to run.
 *
 * The compiler is required rather than bundled (§8 Q6): shipping a binary per
 * platform would mean owning its update cadence and its size, and every user of
 * this preview is already a user of `yxl` — the thing being previewed is its
 * input. A missing one is a message with the install instructions, not a
 * mystery.
 */
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

/** The version out of `yxl version`, which answers `yxl 0.3.4`. */
export function versionOf(said: string): string | null {
  return /(\d+\.\d+\.\d+)/.exec(said)?.[1] ?? null;
}

/**
 * What to say about a compiler that is not the one this editor targets (§8 Q6).
 *
 * Neither direction refuses anything. A newer compiler builds what this writes,
 * because what this writes is ordinary yxl; an older one may not have a
 * construct this editor understands. `yxl build` failing is the honest signal
 * either way, and it has a better error than anything guessed here.
 */
export function versionWarning(found: string | null, target: string): string | null {
  if (found === null) return `\`yxl version\` did not say which version it is.`;
  if (found === target) return null;

  const older = compare(found, target) < 0;
  return older
    ? `yxl ${found} is older than the ${target} this preview targets: a construct it understands may not exist there.`
    : `yxl ${found} is newer than the ${target} this preview targets: what it writes still builds, but the schema may have moved.`;
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
