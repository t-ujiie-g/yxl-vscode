/**
 * Every diagnostic this package can raise.
 *
 * One so far, and it is the one that matters: an edit whose inverse this
 * algebra cannot express is refused rather than made (ADR-010).
 */
export const CODE = {
  noInverse: 'patch.no-inverse',
} as const;

export type Code = (typeof CODE)[keyof typeof CODE];
