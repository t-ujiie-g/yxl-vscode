import type { Span } from './span';

export type Severity = 'error' | 'warning';

/**
 * One thing wrong with a spec, and where. `code` is stable and greppable
 * (`cst.unexpected-anchor`); `message` is prose and may be reworded freely.
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
