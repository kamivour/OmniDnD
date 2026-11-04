/** One line of a breakdown tooltip: `DEX +2`, `Jack of All Trades +1` (SPEC §5). */
export interface Part {
  label: string;
  value: number;
}

/** A computed number with the parts that make it up. */
export interface Stat {
  value: number;
  parts: Part[];
  /** Formulas, floors and source details that are not additive parts of the result. */
  notes?: string[];
}

export function sumParts(parts: Part[]): Stat {
  return { value: parts.reduce((sum, part) => sum + part.value, 0), parts };
}
