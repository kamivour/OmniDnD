import { Bird, Bot, Cat, Dog, Fish, Flame, Ghost, PawPrint, Rat, Sparkles } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { companionIcon } from './companion-icon';
import { COMPANION_TEMPLATES } from './templates';

describe('companionIcon', () => {
  it('matches common creatures by name', () => {
    expect(companionIcon({ name: 'Mastiff', kind: 'Medium beast' })).toBe(Dog);
    expect(companionIcon({ name: 'Wolf' })).toBe(Dog);
    expect(companionIcon({ name: 'Panther' })).toBe(Cat);
    expect(companionIcon({ name: 'Owl' })).toBe(Bird);
    expect(companionIcon({ name: 'Weasel' })).toBe(Rat);
    expect(companionIcon({ name: 'Beast of the Sea' })).toBe(Fish);
  });

  it('prefers the name over the kind', () => {
    expect(companionIcon({ name: 'Fey Spirit', kind: 'Medium spirit' })).toBe(Sparkles);
    expect(companionIcon({ name: 'Shadow Spirit', kind: 'Medium spirit' })).toBe(Ghost);
    expect(companionIcon({ name: 'Fiendish Spirit', kind: 'Medium spirit' })).toBe(Flame);
  });

  it('falls back to the kind, then a paw print', () => {
    expect(companionIcon({ name: 'Clank', kind: 'Medium construct' })).toBe(Bot);
    expect(companionIcon({ name: 'Riding horse', kind: 'Large beast' })).toBe(PawPrint);
    expect(companionIcon({ name: 'Biscuit' })).toBe(PawPrint);
  });

  it('does not match words inside other words', () => {
    expect(companionIcon({ name: 'Pirate Catherine' })).toBe(PawPrint);
  });

  it('gives every built-in template an icon', () => {
    for (const { companion } of COMPANION_TEMPLATES) expect(companionIcon(companion)).toBeTruthy();
  });
});
