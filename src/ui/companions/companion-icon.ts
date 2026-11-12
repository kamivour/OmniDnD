import {
  Bird,
  Bot,
  Brain,
  Bug,
  Cat,
  Dog,
  Fish,
  Flame,
  Ghost,
  PawPrint,
  Rabbit,
  Rat,
  Shell,
  Skull,
  Snail,
  Sparkles,
  Squirrel,
  Sun,
  Turtle,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { Companion } from '../../engine/schema';

/** First match wins; name is checked before kind so "Fey Spirit" beats "Medium spirit". */
const RULES: [RegExp, LucideIcon][] = [
  [/\b(mastiff|dog|hound|wolf|jackal|coyote)s?\b/, Dog],
  [/\b(cat|panther|lion|tiger|leopard|lynx)s?\b/, Cat],
  [/\b(hawk|owl|raven|crow|eagle|falcon|bird|vulture|bat|sky)s?\b/, Bird],
  [/\b(rat|weasel|mouse|mice)s?\b/, Rat],
  [/\b(rabbit|hare)s?\b/, Rabbit],
  [/\bsquirrels?\b/, Squirrel],
  [/\b(quipper|fish|sea horse|seahorse|sea-horse|octopus|shark|sea)\b/, Fish],
  [/\b(crab|shell)s?\b/, Shell],
  [/\b(spider|insect|beetle|wasp|scorpion)s?\b/, Bug],
  [/\b(turtle|tortoise)s?\b/, Turtle],
  [/\bsnails?\b/, Snail],
  [/\b(shadow|ghost|specter|spectre)\b/, Ghost],
  [/\b(undead|skeleton|zombie)\b/, Skull],
  [/\b(fiend|fiendish|devil|demon|imp|draconic|dragon)\b/, Flame],
  [/\b(celestial|angel)\b/, Sun],
  [/\b(fey|sprite|pixie)\b/, Sparkles],
  [/\b(elemental)\b/, Wind],
  [/\b(aberrant|aberration)\b/, Brain],
  [/\b(construct|defender|cannon|homunculus)\b/, Bot],
];

/** A small picture for a companion, guessed from its name and kind; a paw print when nothing matches. */
export function companionIcon(companion: Pick<Companion, 'name' | 'kind'>): LucideIcon {
  for (const text of [companion.name, companion.kind ?? '']) {
    const lower = text.toLowerCase();
    const hit = RULES.find(([pattern]) => pattern.test(lower));
    if (hit) return hit[1];
  }
  return PawPrint;
}
