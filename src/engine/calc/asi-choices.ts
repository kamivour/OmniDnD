import type { Registry } from '../registry';
import type { CharacterBuild } from '../schema';
import { asiLevels } from './level-choices';

/** Legacy feats have no class/level provenance: allocate each once, in recorded class order. */
export function openAsiChoices(build: CharacterBuild, registry: Registry) {
  const used = new Set(build.abilityScores.bonuses.map((bonus) => bonus.source));
  const available = build.classes.flatMap(({ classId, level }) => {
    const name = registry.get('class', classId).name;
    return asiLevels(classId)
      .filter((at) => at <= level && !used.has(`ASI: ${name} ${at}`))
      .map((at) => ({ classId, level: at }));
  });
  const feats = build.featureIds.filter((id) => {
    const row = registry.entries.get(id);
    return row?.kind === 'feature' && row.origin === 'feat';
  }).length;
  return available.slice(feats);
}
