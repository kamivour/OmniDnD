import type { Registry } from '../registry';
import type { ClassDef, SubclassDef } from '../schema';

/** Spellcasting block shared by classes and spellcasting subclasses. */
export type Spellcasting = NonNullable<ClassDef['spellcasting']> & {
  /** Class whose spell list supplies the choices, when it is not the owning class. */
  spellList?: string;
};

/**
 * The spellcasting a class entry gives. Fighter and Rogue gain it from a subclass (Eldritch
 * Knight, Arcane Trickster) once the subclass is picked and its first feature level is reached.
 */
export function entryCasting(
  registry: Registry,
  entry: { classId: string; subclassId?: string | undefined; level: number },
  def: ClassDef | undefined = registry.entries.get(entry.classId) as ClassDef | undefined,
): Spellcasting | undefined {
  if (def?.spellcasting) return def.spellcasting;
  if (!entry.subclassId) return undefined;
  const sub = registry.entries.get(entry.subclassId) as SubclassDef | undefined;
  if (sub?.kind !== 'subclass' || !sub.spellcasting) return undefined;
  const first = Math.min(...sub.features.map((feature) => feature.level));
  return entry.level >= first ? sub.spellcasting : undefined;
}
