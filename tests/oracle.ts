import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './corpus';

/**
 * The `yxl` this editor targets, from the one place it is written down
 * (`ROADMAP.md` §8 Q6).
 */
export const PINNED: string = version(join(REPO_ROOT, 'package.json'));

/**
 * The compiler itself, as the conformance oracle (ADR-012, ADR-018).
 *
 * `YXL_BIN` names a build that is not on the path — which is how CI runs the
 * pinned release without installing it over whatever the machine already has.
 */
const { YXL_BIN } = process.env;
const BIN = YXL_BIN ?? 'yxl';

/** What the compiler made of a spec: whether it would build, and what it said. */
export interface Verdict {
  readonly ok: boolean;
  readonly said: string;
}

/**
 * The oracle's version, or `null` when there is no oracle to ask.
 *
 * Tier 3 means nothing against a different version — the schema is not frozen
 * until yxl's v1.0, so a disagreement with the wrong build says nothing about
 * this code. The tests assert this equals `PINNED` rather than skipping, so a
 * missing or mismatched oracle fails loudly instead of passing vacuously.
 */
export function oracleVersion(): string | null {
  try {
    const said = execFileSync(BIN, ['version'], { encoding: 'utf8' });
    return said.trim().replace(/^yxl\s+/, '');
  } catch {
    return null;
  }
}

/**
 * Run `yxl build --check` over a spec: the validator of record, writing nothing
 * (ADR-011).
 *
 * Exit 1 is a spec the compiler refuses and is an answer; anything else is this
 * harness calling it wrong, and is thrown rather than read as a verdict.
 */
export function check(spec: string): Verdict {
  try {
    const said = execFileSync(BIN, ['build', spec, '--check'], { encoding: 'utf8' });
    return { ok: true, said: said.trim() };
  } catch (failure) {
    const { status, stdout } = failure as { status?: number; stdout?: Buffer };
    const said = String(stdout ?? '').trim();
    if (status !== 1) throw new Error(`\`${BIN} build ${spec} --check\` exited ${status}: ${said}`);
    return { ok: false, said };
  }
}

function version(manifest: string): string {
  const read: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  const pinned = (read as { yxl?: { targetVersion?: unknown } }).yxl?.targetVersion;
  if (typeof pinned !== 'string') throw new Error(`${manifest} pins no yxl version`);
  return pinned;
}
