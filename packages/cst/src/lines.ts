export function lineStart(source: string, offset: number): number {
  return source.lastIndexOf('\n', offset - 1) + 1;
}

/** Past the line break, so a removed line takes its own newline with it. */
export function lineEnd(source: string, offset: number): number {
  const found = source.indexOf('\n', offset);
  return found === -1 ? source.length : found + 1;
}

/** The line ending the file already uses; a mixed file is already inconsistent, so the first decides. */
export function lineBreak(source: string): string {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Back over the comment lines directly above `start`, which belong to what
 * they sit on. A blank line ends the block: a comment separated by one is a
 * heading for what follows.
 */
export function aboveComments(source: string, start: number): number {
  let at = start;
  while (at > 0) {
    const previous = lineStart(source, at - 1);
    const line = source.slice(previous, at - 1).trim();
    if (!line.startsWith('#')) break;
    at = previous;
  }
  return at;
}

/**
 * Past the comment lines directly below `at` indented at least as far as
 * `least`, which belong to what they sit under. A blank line ends the block,
 * as it does above one.
 */
export function belowComments(source: string, at: number, least: number): number {
  let past = at;

  while (past < source.length) {
    const end = lineEnd(source, past);
    const line = source.slice(past, end);
    if (!line.trim().startsWith('#') || indentWidth(line) < least) break;
    past = end;
  }

  return past;
}

/** How far in a line's first character sits, which is the column a comment on it belongs at. */
export function indentWidth(line: string): number {
  return line.length - line.trimStart().length;
}
