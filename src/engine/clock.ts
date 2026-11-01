import { SECONDS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from './rules2014';

/** Game clock as the UI shows it: "Day 1, 08:00" (D46). */
export function formatClock(seconds: number): string {
  const day = Math.floor(seconds / SECONDS_PER_DAY) + 1;
  const ofDay = seconds % SECONDS_PER_DAY;
  const hours = Math.floor(ofDay / SECONDS_PER_HOUR);
  const minutes = Math.floor((ofDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `Day ${day}, ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** A span of game time, largest units first: "1 h", "1 h 30 min", "6 s", "2 days". */
export function formatDuration(seconds: number): string {
  const units = [
    [SECONDS_PER_DAY, 'day'],
    [SECONDS_PER_HOUR, 'h'],
    [SECONDS_PER_MINUTE, 'min'],
    [1, 's'],
  ] as const;
  const parts: string[] = [];
  let left = seconds;
  for (const [size, unit] of units) {
    const count = Math.floor(left / size);
    left -= count * size;
    if (count === 0) continue;
    parts.push(unit === 'day' ? `${count} ${count === 1 ? 'day' : 'days'}` : `${count} ${unit}`);
  }
  return parts.length > 0 ? parts.join(' ') : '0 s';
}
