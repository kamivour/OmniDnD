/** Display helpers shared by screens. Pure formatting, no rules. */

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function schoolIconId(school: string): string {
  return `school.${school.toLowerCase()}`;
}

export function spellLevelLabel(level: number): string {
  return level === 0 ? 'Cantrip' : `L${level}`;
}

/** Bar color by fraction left: heal > 50 %, warn 25–50 %, danger < 25 %. */
export function hpTone(current: number, max: number): 'heal' | 'warn' | 'danger' {
  const ratio = max > 0 ? current / max : 0;
  if (ratio > 0.5) return 'heal';
  if (ratio >= 0.25) return 'warn';
  return 'danger';
}
