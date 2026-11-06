const CR_FRACTIONS: Record<number, string> = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };

/** Challenge rating as printed in a statblock: 1/8, 1/4, 1/2, then whole numbers. */
export const crText = (cr: number) => CR_FRACTIONS[cr] ?? String(cr);
