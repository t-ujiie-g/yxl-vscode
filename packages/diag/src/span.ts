/**
 * A half-open range of UTF-16 code units in one source file.
 *
 * Offsets rather than line/column, because that is what every producer here
 * naturally has and what every consumer needs to slice text. A line/column
 * `Position` is derived on demand, at the edge that displays it.
 */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** A one-indexed place in a source file, as an editor counts. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

export function span(start: number, end: number): Span {
  return { start, end };
}

/** The smallest span covering both, for a node reported as a whole. */
export function union(a: Span, b: Span): Span {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

export function contains(outer: Span, offset: number): boolean {
  return offset >= outer.start && offset < outer.end;
}
