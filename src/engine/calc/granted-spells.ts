import type { Registry } from '../registry';
import type { CharacterBuild } from '../schema';
import { isPreparedCaster2014 } from './spell-selections';

export interface GrantedSpell {
  spellId: string;
  classId: string;
  /** Subclass name, shown as the reason the spell is always ready. */
  from: string;
}

type SpellList = CharacterBuild['spells'][number];

/**
 * Subclass spells (domain, oath, circle, ...) unlocked by the class level reached.
 * https://www.dndbeyond.com/sources/dnd/basic-rules-2014/classes#DomainSpells
 */
export function grantedSpells(
  registry: Registry,
  build: Pick<CharacterBuild, 'classes'>,
): GrantedSpell[] {
  const granted: GrantedSpell[] = [];
  const seen = new Set<string>();
  for (const classId of new Set(build.classes.map((entry) => entry.classId))) {
    const entries = build.classes.filter((entry) => entry.classId === classId);
    const level = entries.reduce((sum, entry) => sum + entry.level, 0);
    const subclassId = entries.find((entry) => entry.subclassId)?.subclassId;
    const subclass = subclassId ? registry.entries.get(subclassId) : undefined;
    if (subclass?.kind !== 'subclass') continue;
    for (const step of subclass.grantedSpells ?? []) {
      if (step.level > level) continue;
      for (const spellId of step.spellIds) {
        const key = `${classId}:${spellId}`;
        if (seen.has(key) || registry.entries.get(spellId)?.kind !== 'spell') continue;
        seen.add(key);
        granted.push({ spellId, classId, from: subclass.name });
      }
    }
  }
  return granted;
}

/**
 * The character's spell lists with granted spells added, stored the way each class keeps its
 * own: cantrips and known-caster spells as known, prepared-caster spells as prepared. Stored
 * selections stay untouched.
 */
export function spellListsWithGrants(
  registry: Registry,
  build: Pick<CharacterBuild, 'classes' | 'spells'>,
): SpellList[] {
  const byClass = new Map<string, string[]>();
  for (const { classId, spellId } of grantedSpells(registry, build))
    byClass.set(classId, [...(byClass.get(classId) ?? []), spellId]);
  const cantrip = (id: string) => registry.get('spell', id).level === 0;
  const merge = (list: SpellList, ids: string[]): SpellList => {
    if (!isPreparedCaster2014(list.classId))
      return { ...list, known: [...new Set([...list.known, ...ids])] };
    return {
      ...list,
      known: [...new Set([...list.known, ...ids.filter(cantrip)])],
      prepared: [...new Set([...(list.prepared ?? []), ...ids.filter((id) => !cantrip(id))])],
    };
  };
  // Grants join the class's first stored list, so each class still reads as one list.
  const lists = build.spells.map((list) => {
    const ids = byClass.get(list.classId);
    if (!ids) return list;
    byClass.delete(list.classId);
    return merge(list, ids);
  });
  for (const [classId, ids] of byClass) lists.push(merge({ classId, known: [] }, ids));
  return lists;
}
