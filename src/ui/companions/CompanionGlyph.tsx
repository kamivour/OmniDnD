import { createElement } from 'react';
import type { LucideProps } from 'lucide-react';
import type { Companion } from '../../engine/schema';
import { companionIcon } from './companion-icon';

/** Decorative icon for a companion, chosen from its name and kind. */
export function CompanionGlyph({
  companion,
  ...props
}: { companion: Pick<Companion, 'name' | 'kind'> } & LucideProps) {
  return createElement(companionIcon(companion), { 'aria-hidden': true, ...props });
}
