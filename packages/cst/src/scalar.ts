const NULL = /^(?:~|null|Null|NULL|)$/;
const BOOL_TRUE = /^(?:true|True|TRUE)$/;
const BOOL_FALSE = /^(?:false|False|FALSE)$/;
const DECIMAL = /^[-+]?\d+$/;
const OCTAL = /^0o[0-7]+$/;
const HEX = /^0x[\dA-Fa-f]+$/;
const FLOAT = /^[-+]?(?:\.\d+|\d+(?:\.\d*)?)(?:[eE][-+]?\d+)?$/;
const INFINITY = /^([-+])?\.(?:inf|Inf|INF)$/;
const NOT_A_NUMBER = /^\.(?:nan|NaN|NAN)$/;

/**
 * The YAML 1.2 core schema's resolution of a plain scalar. An integer too large
 * for a double stays a string rather than losing digits.
 */
export function resolvePlain(source: string): string | number | boolean | null {
  if (NULL.test(source)) return null;
  if (BOOL_TRUE.test(source)) return true;
  if (BOOL_FALSE.test(source)) return false;

  if (DECIMAL.test(source)) return exactInteger(source, source, 10);
  if (OCTAL.test(source)) return exactInteger(source, source.slice(2), 8);
  if (HEX.test(source)) return exactInteger(source, source.slice(2), 16);

  const infinite = INFINITY.exec(source);
  if (infinite) return infinite[1] === '-' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  if (NOT_A_NUMBER.test(source)) return Number.NaN;
  if (FLOAT.test(source)) return Number.parseFloat(source);

  return source;
}

function exactInteger(source: string, digits: string, radix: number): string | number {
  const parsed = radix === 10 ? Number(digits) : Number.parseInt(digits, radix);
  return Number.isSafeInteger(parsed) ? parsed : source;
}
