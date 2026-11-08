import type { FindEntry } from '../../engine/calc/find';

/**
 * Every screen, panel and action Find can reach. Add a line here when you add a screen or a
 * section people may look for; `places.test.ts` fails when a built route has no entry.
 * `anchor` is an element id or the aria-label of a section on that screen.
 */
export const PLACES: readonly FindEntry[] = [
  // Screens
  { id: 'go.home', group: 'go', title: 'Home', detail: 'Dashboard', synonyms: ['dashboard', 'overview', 'hp', 'resources'], target: { kind: 'go', path: '' }, needsCharacter: true },
  { id: 'go.sheet', group: 'go', title: 'Sheet', detail: 'Character sheet', synonyms: ['character sheet', 'stats', 'abilities', 'saves'], target: { kind: 'go', path: 'sheet' }, needsCharacter: true },
  { id: 'go.spells', group: 'go', title: 'Spells', detail: 'Spellbook and slots', synonyms: ['spellbook', 'cast', 'slots', 'prepare', 'cantrips'], target: { kind: 'go', path: 'spells' }, needsCharacter: true },
  { id: 'go.combat', group: 'go', title: 'Combat', detail: 'Turns, attacks and actions', synonyms: ['fight', 'attack', 'initiative', 'turn', 'damage'], target: { kind: 'go', path: 'combat' }, needsCharacter: true },
  { id: 'go.explore', group: 'go', title: 'Explore', detail: 'Skills, rituals, body numbers', synonyms: ['exploration', 'travel', 'skill check'], target: { kind: 'go', path: 'explore' }, needsCharacter: true },
  { id: 'go.inventory', group: 'go', title: 'Inventory', detail: 'Items, gold and weight', synonyms: ['items', 'gear', 'equipment', 'gold', 'money', 'carry', 'bag'], target: { kind: 'go', path: 'inventory' }, needsCharacter: true },
  { id: 'go.features', group: 'go', title: 'Features', detail: 'Class and race features', synonyms: ['abilities', 'traits', 'feats'], target: { kind: 'go', path: 'features' }, needsCharacter: true },
  { id: 'go.companions', group: 'go', title: 'Companions', detail: 'Pets, mounts, familiars', synonyms: ['pet', 'mount', 'familiar', 'summon'], target: { kind: 'go', path: 'companions' }, needsCharacter: true },
  { id: 'go.journal', group: 'go', title: 'Journal', detail: 'Notes and session log', synonyms: ['notes', 'log', 'diary'], target: { kind: 'go', path: 'journal' }, needsCharacter: true },
  { id: 'go.todo', group: 'go', title: 'To do', detail: 'Choices still waiting', synonyms: ['pending', 'choices', 'level up', 'subclass'], target: { kind: 'go', path: 'todo' }, needsCharacter: true },
  { id: 'go.reference', group: 'go', title: 'Reference', detail: 'Rules search, tables, links', synonyms: ['rules', 'lookup', 'help'], target: { kind: 'go', path: 'reference' } },
  { id: 'go.tools', group: 'go', title: 'Tools', detail: 'Outside tools for play and prep', synonyms: ['links', 'directory', 'vtt', 'maps'], target: { kind: 'go', path: 'reference/tools' } },
  { id: 'go.credits', group: 'go', title: 'Credits', detail: 'Sources and licenses', synonyms: ['license', 'attribution', 'srd'], target: { kind: 'go', path: 'reference/credits' } },
  { id: 'go.settings', group: 'go', title: 'Settings', detail: 'Theme, hints, data', synonyms: ['preferences', 'options', 'theme', 'backup', 'export', 'import'], target: { kind: 'go', path: 'settings' } },
  { id: 'go.print', group: 'go', title: 'Print view', detail: 'Printable character sheet', synonyms: ['print', 'pdf', 'paper', 'save as pdf'], target: { kind: 'go', path: 'print' }, needsCharacter: true },

  // Sections
  { id: 'go.movement-body', group: 'go', title: 'Movement and body', detail: 'Explore', synonyms: ['jump', 'long jump', 'high jump', 'lift', 'push', 'drag', 'carry', 'hold breath', 'food', 'water', 'climb', 'swim'], target: { kind: 'go', path: 'explore', anchor: 'Movement and body' }, needsCharacter: true },
  { id: 'go.skills', group: 'go', title: 'Skills', detail: 'Explore', synonyms: ['athletics', 'acrobatics', 'stealth', 'perception', 'skill check'], target: { kind: 'go', path: 'explore', anchor: 'Skills' }, needsCharacter: true },
  { id: 'go.passives', group: 'go', title: 'Passive scores', detail: 'Explore', synonyms: ['passive perception', 'passive insight', 'investigation'], target: { kind: 'go', path: 'explore', anchor: 'Passives' }, needsCharacter: true },
  { id: 'go.rituals', group: 'go', title: 'Utility spells and rituals', detail: 'Explore', synonyms: ['ritual', 'identify', 'detect magic', 'utility'], target: { kind: 'go', path: 'explore', anchor: 'Utility spells and rituals' }, needsCharacter: true },
  { id: 'go.resources', group: 'go', title: 'Resources', detail: 'Home', synonyms: ['slots', 'uses', 'ki', 'rage', 'hit dice'], target: { kind: 'go', path: '', anchor: 'Resources' }, needsCharacter: true },
  { id: 'go.conditions', group: 'go', title: 'Conditions', detail: 'Home', synonyms: ['poisoned', 'prone', 'blinded', 'exhaustion', 'status'], target: { kind: 'go', path: '', anchor: 'Conditions' }, needsCharacter: true },
  { id: 'go.turn-economy', group: 'go', title: 'Turn economy', detail: 'Combat', synonyms: ['action', 'bonus action', 'reaction', 'movement'], target: { kind: 'go', path: 'combat', anchor: 'Turn economy' }, needsCharacter: true },
  { id: 'go.quick-tables', group: 'go', title: 'Quick tables', detail: 'Reference', synonyms: ['falling', 'travel pace', 'forced march', 'exhaustion', 'cover', 'lighting'], target: { kind: 'go', path: 'reference', anchor: 'reference-tables' } },
  { id: 'go.rules-search', group: 'go', title: 'Search rules', detail: 'Reference', synonyms: ['rules', 'conditions', 'spells lookup', 'monsters'], target: { kind: 'go', path: 'reference', anchor: 'reference-search' } },
  { id: 'go.bookmarks', group: 'go', title: 'Bookmarks', detail: 'Reference', synonyms: ['links', 'saved'], target: { kind: 'go', path: 'reference', anchor: 'reference-bookmarks' } },

  // Actions
  { id: 'do.long-rest', group: 'do', title: 'Long rest', detail: 'Restore HP, slots and uses', synonyms: ['sleep', 'overnight', 'rest'], target: { kind: 'action', action: 'long-rest' }, needsCharacter: true },
  { id: 'do.short-rest', group: 'do', title: 'Short rest', detail: 'Spend hit dice', synonyms: ['hit dice', 'rest', 'breather'], target: { kind: 'action', action: 'short-rest' }, needsCharacter: true },
];
