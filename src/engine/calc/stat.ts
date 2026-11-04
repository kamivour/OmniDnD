/** One line of a breakdown tooltip: `DEX +2`, `Jack of All Trades +1` (SPEC §5). */
export interface Part {
  label: string;
  value: number;
}

/** A computed number with the parts that make it up. */
export interface Stat {
  value: number;
  parts: Part[];
  /** An explicit, noted replacement; calculated retains the value before this override. */
  override?: { path: string; note: string; calculated: number; value: number };
  /** Formulas, floors and source details that are not additive parts of the result. */
  notes?: string[];
}

export function sumParts(parts: Part[]): Stat {
  // Integer contributions can temporarily exceed the safe range before cancelling.
  // Sum them exactly so a safe final result cannot hide intermediate rounding.
  const value = parts.every((part) => Number.isSafeInteger(part.value))
    ? Number(parts.reduce((sum, part) => sum + BigInt(part.value), 0n))
    : parts.reduce((sum, part) => sum + part.value, 0);
  return { value, parts };
}
