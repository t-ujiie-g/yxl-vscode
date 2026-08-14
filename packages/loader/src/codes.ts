/**
 * Every diagnostic this package can raise.
 *
 * A code is stable and greppable, so it is API: it appears in messages users
 * report and in tests that pin behaviour.
 *
 * What is here and what is not follows ADR-011. A key this editor does not
 * model is not an error — it is carried, and `yxl build --check` is where a
 * spec hears about a real one. These are the things that stop a construct from
 * being *projected*: a reference that is not one, a value of the wrong kind, a
 * spelling outside the vocabulary.
 */
export const CODE = {
  unnamedFile: 'loader.unnamed-file',
  notAMapping: 'loader.not-a-mapping',
  notASequence: 'loader.not-a-sequence',
  notText: 'loader.not-text',
  notABoolean: 'loader.not-a-boolean',
  notANumber: 'loader.not-a-number',
  notAValue: 'loader.not-a-value',
  duplicateKey: 'loader.duplicate-key',
  unknownKey: 'loader.unknown-key',
  missingKey: 'loader.missing-key',
  emptyCell: 'loader.empty-cell',
  conflictingKeys: 'loader.conflicting-keys',
  badAddress: 'loader.bad-address',
  badRange: 'loader.bad-range',
  badColumn: 'loader.bad-column',
  badRow: 'loader.bad-row',
  badColor: 'loader.bad-color',
  badName: 'loader.bad-name',
  badPath: 'loader.bad-path',
  unknownSpelling: 'loader.unknown-spelling',
  includeNotExpanded: 'loader.include-not-expanded',
} as const;

export type Code = (typeof CODE)[keyof typeof CODE];
