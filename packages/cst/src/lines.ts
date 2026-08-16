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
