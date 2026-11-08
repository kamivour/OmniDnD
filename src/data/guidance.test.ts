import { describe, expect, it } from 'vitest';
import { allGuidance, guidanceFor } from './guidance';
import { registry } from './registry';

const KINDS = ['class', 'subclass', 'race', 'background'] as const;

describe('beginner guidance', () => {
  it('covers every class, subclass, race and background in the registry', () => {
    const missing = KINDS.flatMap((kind) =>
      [...registry.entries.values()]
        .filter((entry) => entry.kind === kind && !guidanceFor(entry.id))
        .map((entry) => entry.id),
    );
    expect(missing).toEqual([]);
  });

  it('points only at entries that exist, with the right kind', () => {
    const problems: string[] = [];
    for (const item of allGuidance) {
      const own = registry.entries.get(item.id);
      if (own?.kind !== item.kind) problems.push(`${item.id}: not a ${item.kind}`);
      const links = [...(item.starterSpells ?? []), ...(item.goodWith ?? [])];
      for (const link of links)
        if (!registry.entries.has(link.id)) problems.push(`${item.id}: unknown ${link.id}`);
      for (const spell of item.starterSpells ?? [])
        if (registry.entries.get(spell.id)?.kind !== 'spell')
          problems.push(`${item.id}: ${spell.id} is not a spell`);
    }
    expect(problems).toEqual([]);
  });

  it('has one entry per id and gives classes and subclasses their main abilities', () => {
    expect(new Set(allGuidance.map((item) => item.id)).size).toBe(allGuidance.length);
    const noAbilities = allGuidance
      .filter((item) => item.kind === 'class' || item.kind === 'subclass')
      .filter((item) => !item.mainAbilities?.length)
      .map((item) => item.id);
    expect(noAbilities).toEqual([]);
  });
});
