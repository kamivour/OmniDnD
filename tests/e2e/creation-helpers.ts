import type { Locator, Page } from '@playwright/test';

export function identityChoice(scope: Page | Locator, id: string) {
  return scope.getByRole('radio').and(scope.locator(`input[value="${id}"]`));
}
