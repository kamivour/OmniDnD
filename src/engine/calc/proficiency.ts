/** PHB 2014: +2 at levels 1–4, then +1 every 4 levels, up to +6 at 17–20. */
export function proficiencyBonus(totalLevel: number): number {
  return Math.ceil(totalLevel / 4) + 1;
}
