import type { Span } from './span';

export type Severity = 'error' | 'warning';

/**
 * One thing wrong with a spec, in the shape the UI and the CLI both render.
 *
 * A diagnostic always names a place. Producing one without a span means the
 * reader is told something is wrong and not where — which is the failure mode
 * `yxl` itself is still working out of (its ADR-016), and there is no reason to
 * repeat it here where the parser hands us offsets for free.
 *
 * `code` is stable and greppable (`cst.unexpected-anchor`); `message` is prose
 * and may be reworded freely.
 */
export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly span: Span;
}

export function error(
  code: string,
  message: string,
  where: { file: string; span: Span },
): Diagnostic {
  return { severity: 'error', code, message, file: where.file, span: where.span };
}
