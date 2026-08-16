/** Every diagnostic this package can raise; a code is stable and greppable, so it is API. */
export const CODE = {
  noInverse: 'patch.no-inverse',
} as const;

export type Code = (typeof CODE)[keyof typeof CODE];
