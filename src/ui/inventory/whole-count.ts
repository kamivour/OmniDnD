/** Parse decimal text exactly before converting a whole count to a safe JavaScript number. */
export function parseWholeCount(input: string): number | undefined {
  const match = /^\+?(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(input.trim());
  if (!match) return undefined;
  const mantissa = match[1]!;
  const point = mantissa.indexOf('.');
  const decimals = point < 0 ? 0 : mantissa.length - point - 1;
  const digits = mantissa.replace('.', '').replace(/^0+/, '');
  if (digits === '') return 0;

  const exponentText = match[2] ?? '0';
  const exponentDigits = exponentText.replace(/^[+-]/, '').replace(/^0+/, '') || '0';
  // A valid nonzero result cannot shift more places than the mantissa plus the safe
  // integer width. Compare exponent text first, so huge exponents never reach padding.
  const limit = String(mantissa.length + 16);
  if (
    exponentDigits.length > limit.length ||
    (exponentDigits.length === limit.length && exponentDigits > limit)
  )
    return undefined;
  const exponent = Number(exponentDigits) * (exponentText.startsWith('-') ? -1 : 1);
  const wholeDigits = digits.length + exponent - decimals;
  if (wholeDigits < 1 || wholeDigits > 16) return undefined;
  if (/[1-9]/.test(digits.slice(wholeDigits))) return undefined;
  const whole = Number(digits.slice(0, wholeDigits).padEnd(wholeDigits, '0'));
  return Number.isSafeInteger(whole) ? whole : undefined;
}
