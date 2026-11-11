const fs = require('fs');

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * d: { cls, slug, name, pitch, diff, abil [], str [], weak [],
 *      feats: [[level, name, activation, effect, uses?]] }
 * uses: 'pool:<featureId>' | [max, recharge] where max is number | 'CHA' | {proficiency:'full'} | {byLevel:{}}
 */
function addSubclasses(source, list) {
  const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const wr = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
  const subs = rd('data/content/subclasses.json');
  const feats = rd('data/content/features.json');
  const guid = rd('data/content/guidance.json');
  const srdFeats = rd('data/srd/features.json');
  const ids = new Set([...subs, ...feats, ...srdFeats].map((e) => e.id));
  for (const d of list) {
    const sid = `subclass.${d.cls}.${d.slug}`;
    if (ids.has(sid)) throw new Error('dup ' + sid);
    const refs = [];
    for (const [level, name, act, effect, uses] of d.feats) {
      if (effect.split(/\s+/).length > 40) throw new Error('long ' + name + ' ' + d.name);
      const fid = `feature.${d.cls}.${d.slug}-${slugify(name.replace(/^[^:]*:\s*/, ''))}`;
      if (ids.has(fid)) throw new Error('dup ' + fid);
      ids.add(fid);
      const f = {
        kind: 'feature',
        id: fid,
        name,
        ruleset: '5e-2014',
        source,
        srd: false,
        summaryReviewed: false,
        summary: { effect },
        origin: 'subclass',
        activation: act,
      };
      if (typeof uses === 'string') f.usesFrom = uses.replace('pool:', '');
      else if (uses) {
        const [mx, rc] = uses;
        const max = typeof mx === 'string' ? { abilityMod: mx, min: 1 } : mx;
        f.uses = { max, recharge: rc };
      }
      feats.push(f);
      refs.push({ level, featureId: fid });
    }
    subs.push({
      kind: 'subclass',
      id: sid,
      name: d.name,
      ruleset: '5e-2014',
      source,
      srd: false,
      summaryReviewed: false,
      summary: { effect: d.pitch },
      classId: `class.${d.cls}`,
      features: refs,
    });
    guid.push({
      id: sid,
      kind: 'subclass',
      pitch: d.pitch,
      difficulty: d.diff,
      mainAbilities: d.abil,
      strengths: d.str,
      weaknesses: d.weak,
    });
  }
  wr('data/content/subclasses.json', subs);
  wr('data/content/features.json', feats);
  wr('data/content/guidance.json', guid);
}

module.exports = { addSubclasses };
