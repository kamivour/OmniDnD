import type { Chapter } from './model';

/** Every tutorial chapter. A new screen adds its tips here (see AGENTS.md). */
export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    tip: false,
    steps: [
      {
        id: 'intro',
        title: 'Welcome to OmniDnD',
        body: 'This app keeps track of your character. You and your DM decide what happens; the app never rules for you.',
      },
      {
        id: 'campaigns',
        target: 'campaigns',
        title: 'Campaigns',
        body: 'Each campaign groups its characters and house rules. Everything is saved on this device.',
      },
      {
        id: 'new-campaign',
        target: 'new-campaign',
        title: 'Start a campaign',
        body: 'Name it, pick the rules options, and you are ready for characters.',
      },
      {
        id: 'new-character',
        target: 'new-character',
        title: 'Add a character',
        body: 'Pick your choices; the app works out the numbers. You can also import a character from a file.',
      },
      {
        id: 'find',
        target: 'find',
        title: 'Find anything',
        body: 'Search for a screen, rule, spell or tool. Shortcut: Ctrl+K or the / key.',
      },
      {
        id: 'settings',
        target: 'settings',
        title: 'Settings',
        body: 'Theme, backups, the optional account for syncing devices, and this tutorial.',
      },
      {
        id: 'replay',
        title: 'Replay any time',
        body: 'You can see this tour again from Settings → Tutorial. Have fun at the table.',
      },
    ],
  },
];
