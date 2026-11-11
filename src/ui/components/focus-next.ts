import type { KeyboardEvent } from 'react';

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])';

/**
 * Enter in an entry field moves to the next field instead of submitting the form.
 * The next field is the next visible input or select after this one in the same form
 * (or the page when there is no form); at the last field, Enter does nothing.
 */
export function focusNextOnEnter(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  const current = event.currentTarget;
  event.preventDefault();
  const scope = current.closest('form') ?? document;
  const fields = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0 && el.closest('[hidden]') === null,
  );
  const index = fields.indexOf(current);
  const next = fields.slice(index + 1).find((el) => el.tagName !== 'BUTTON');
  next?.focus();
}
