/**
 * Number fields accept only what a number can hold. Browsers let `e`, `+`, `-` and `.` into
 * `type="number"` inputs (and anything into text inputs with a numeric keyboard), which then
 * leaves the field empty or blocks saving. One document listener covers every number field.
 */

export interface NumericRules {
  /** A leading minus or plus sign is allowed. */
  signed: boolean;
  /** A decimal point is allowed. */
  decimal: boolean;
}

/** Whether typed or pasted text may enter a number field with these rules. */
export function numericTextAllowed(text: string, { signed, decimal }: NumericRules): boolean {
  for (const char of text) {
    if (char >= '0' && char <= '9') continue;
    if (signed && (char === '-' || char === '+')) continue;
    if (decimal && char === '.') continue;
    return false;
  }
  return true;
}

interface NumericFieldLike {
  type: string;
  inputMode: string;
  getAttribute(name: string): string | null;
}

/** The rules for a field, or undefined when it is not a number field. A `min` of 0 or more rules out signs. */
export function numericRules(field: NumericFieldLike): NumericRules | undefined {
  const mode = field.inputMode || field.getAttribute('inputmode') || '';
  if (field.type !== 'number' && mode !== 'numeric' && mode !== 'decimal') return undefined;
  const min = field.getAttribute('min');
  const step = field.getAttribute('step');
  return {
    signed: min === null || min === '' || Number(min) < 0,
    decimal:
      mode === 'decimal' || (step !== null && step !== 'any' && !Number.isInteger(Number(step))),
  };
}

/** Blocks letters and other stray characters from every number field in the document. */
export function installNumericInputGuard(doc: Document = document): () => void {
  const onBeforeInput = (event: Event) => {
    const input = event as InputEvent;
    const field = input.target;
    if (!(field instanceof HTMLInputElement)) return;
    if (!input.inputType.startsWith('insert')) return;
    const rules = numericRules(field);
    if (!rules) return;
    const text = input.data ?? input.dataTransfer?.getData('text/plain') ?? '';
    if (!numericTextAllowed(text, rules)) input.preventDefault();
  };
  doc.addEventListener('beforeinput', onBeforeInput, true);
  return () => doc.removeEventListener('beforeinput', onBeforeInput, true);
}
