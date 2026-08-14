/**
 * Where lines begin and end in a source string.
 *
 * Edits are ranges of text, so inserting and removing whole lines is index
 * arithmetic rather than anything to do with YAML. Keeping it here leaves
 * `apply` to say only which edit an operation becomes.
 */

export function lineStart(source: string, offset: number): number {
  return source.lastIndexOf('\n', offset - 1) + 1;
}

/** Past the line break, so a removed line takes its own newline with it. */
export function lineEnd(source: string, offset: number): number {
  const found = source.indexOf('\n', offset);
  return found === -1 ? source.length : found + 1;
}

/**
 * The line ending the file already uses.
 *
 * A written line has to match, or an edit leaves a lone `\n` in a CRLF file and
 * every later diff reports the mixed endings as changes the author never made.
 * The first break in the file decides, since a file with both is already
 * inconsistent and there is nothing better to follow.
 */
export function lineBreak(source: string): string {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Step back over the comment lines directly above `start`, so an insert lands
 * above them rather than between them and the item they describe.
 *
 * A blank line ends the block: a comment separated by one reads as a section
 * heading for what follows, and a new first item belongs under it, not above.
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
