/** Short 2014 rules reminders in our own words. Not a replacement for the books. */
export interface QuickTable {
  id: string;
  title: string;
  /** One line shown above the rows. */
  note?: string;
  rows: { label: string; text: string }[];
}

export const QUICK_TABLES: QuickTable[] = [
  {
    id: 'actions',
    title: 'Actions in combat',
    rows: [
      { label: 'Attack', text: 'Make one melee or ranged attack (more with Extra Attack).' },
      { label: 'Cast a spell', text: 'Cast a spell that takes one action.' },
      { label: 'Dash', text: 'Gain extra movement equal to your speed this turn.' },
      { label: 'Disengage', text: 'Your movement this turn provokes no opportunity attacks.' },
      { label: 'Dodge', text: 'Attacks against you have disadvantage until your next turn.' },
      {
        label: 'Help',
        text: 'Give an ally advantage on their next check or attack against a foe.',
      },
      { label: 'Hide', text: 'Make a Stealth check to avoid being noticed.' },
      {
        label: 'Ready',
        text: 'Choose a trigger and a response; use your reaction when it happens.',
      },
      { label: 'Search', text: 'Look for something with Perception or Investigation.' },
      {
        label: 'Use an object',
        text: 'Interact with a second object or use one that needs an action.',
      },
    ],
  },
  {
    id: 'cover',
    title: 'Cover',
    rows: [
      { label: 'Half', text: '+2 to AC and Dexterity saves.' },
      { label: 'Three-quarters', text: '+5 to AC and Dexterity saves.' },
      { label: 'Total', text: 'Cannot be targeted directly by attacks or most spells.' },
    ],
  },
  {
    id: 'exhaustion',
    title: 'Exhaustion (2014)',
    note: 'Each level adds to the ones before it.',
    rows: [
      { label: '1', text: 'Disadvantage on ability checks.' },
      { label: '2', text: 'Speed halved.' },
      { label: '3', text: 'Disadvantage on attack rolls and saving throws.' },
      { label: '4', text: 'Hit point maximum halved.' },
      { label: '5', text: 'Speed reduced to 0.' },
      { label: '6', text: 'Death.' },
    ],
  },
  {
    id: 'death-saves',
    title: 'Death saving throws',
    rows: [
      { label: 'Roll', text: 'd20 at the start of your turn at 0 HP. 10 or higher is a success.' },
      { label: 'Three successes', text: 'You become stable.' },
      { label: 'Three failures', text: 'You die.' },
      { label: 'Natural 20', text: 'You regain 1 HP.' },
      { label: 'Natural 1', text: 'Counts as two failures.' },
    ],
  },
  {
    id: 'dc',
    title: 'Typical difficulty classes',
    rows: [
      { label: 'Very easy', text: 'DC 5' },
      { label: 'Easy', text: 'DC 10' },
      { label: 'Medium', text: 'DC 15' },
      { label: 'Hard', text: 'DC 20' },
      { label: 'Very hard', text: 'DC 25' },
      { label: 'Nearly impossible', text: 'DC 30' },
    ],
  },
  {
    id: 'advantage',
    title: 'Advantage and disadvantage',
    rows: [
      { label: 'Advantage', text: 'Roll two d20 and take the higher.' },
      { label: 'Disadvantage', text: 'Roll two d20 and take the lower.' },
      { label: 'Both', text: 'They cancel out, however many of each you have.' },
      { label: 'Stacking', text: 'Several sources of the same kind still mean just two dice.' },
    ],
  },
  {
    id: 'rests',
    title: 'Resting',
    note: 'Your campaign may change these lengths in Campaign Setup.',
    rows: [
      { label: 'Short rest', text: 'At least 1 hour. Spend Hit Dice to heal.' },
      { label: 'Long rest', text: '8 hours. Regain HP, slots and half your Hit Dice.' },
      { label: 'Limit', text: 'One long rest per 24 hours, and you need at least 1 HP.' },
    ],
  },
  {
    id: 'travel-pace',
    title: 'Travel pace',
    note: 'Per party, on foot. The slowest member sets the pace.',
    rows: [
      { label: 'Fast', text: '4 miles an hour, 30 miles a day. Passive Perception drops by 5.' },
      { label: 'Normal', text: '3 miles an hour, 24 miles a day.' },
      { label: 'Slow', text: '2 miles an hour, 18 miles a day. The party can sneak.' },
    ],
  },
  {
    id: 'forced-march',
    title: 'Forced march',
    rows: [
      { label: 'Normal day', text: 'Up to 8 hours of travel.' },
      {
        label: 'Extra hour',
        text: 'Each one needs a Constitution save, DC 10 plus 1 for every hour past 8.',
      },
      { label: 'Failed save', text: 'You gain one level of exhaustion.' },
    ],
  },
  {
    id: 'falling',
    title: 'Falling',
    rows: [
      { label: 'Damage', text: '1d6 bludgeoning for every 10 feet fallen.' },
      { label: 'Cap', text: 'No more than 20d6, however far you fall.' },
      { label: 'Landing', text: 'You land prone unless the fall hurt you not at all.' },
    ],
  },
];
