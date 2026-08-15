/**
 * Every diagnostic compiling can raise.
 *
 * These are the things that stop a construct from being *drawn*: a reference
 * that names nothing, an address that will not resolve, a source this projection
 * cannot read. What a spec must satisfy to build is `yxl build --check`'s to say
 * (ADR-011).
 */
export const CODE = {
  unknownParam: 'compile.unknown-param',
  noSuchParam: 'compile.no-such-param',
  paramCycle: 'compile.param-cycle',
  unclosedPlaceholder: 'compile.unclosed-placeholder',
  unknownValue: 'compile.unknown-value',
  unknownFormula: 'compile.unknown-formula',
  badAddress: 'compile.bad-address',
  badRange: 'compile.bad-range',
  badPath: 'compile.bad-path',
  badColumn: 'compile.bad-column',
  badRow: 'compile.bad-row',
  unknownStyle: 'compile.unknown-style',
  styleCycle: 'compile.style-cycle',
  badColour: 'compile.bad-colour',
  badDate: 'compile.bad-date',
  badDuration: 'compile.bad-duration',
  unknownSheet: 'compile.unknown-sheet',
  noDataReader: 'compile.no-data-reader',
  unreadableData: 'compile.unreadable-data',
  badTable: 'compile.bad-table',
} as const;

export type Code = (typeof CODE)[keyof typeof CODE];
