import type { Span } from './span';
import type { Saying } from './words';

export type Severity = 'error' | 'warning';

/**
 * One thing wrong with a spec, and where. `code` is stable and greppable
 * (`cst.unexpected-anchor`); `message` is what an edge renders in the reader's
 * language (ADR-051).
 */
export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: Saying;
  readonly file: string;
  readonly span: Span;
}

/** One error against a node, which is the only severity a projection reports today. */
export function error(
  code: string,
  message: Saying,
  where: { file: string; span: Span },
): Diagnostic {
  return { severity: 'error', code, message, file: where.file, span: where.span };
}
