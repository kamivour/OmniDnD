import { PreferencesSchema, type Preferences } from '../schema';
import type { ManagementCommand } from './management';

export const updatePreferences: ManagementCommand<Preferences> = {
  name: 'updatePreferences',
  check: (_ctx, payload) =>
    PreferencesSchema.safeParse(payload).success
      ? []
      : [{ level: 'block', reason: 'Settings are invalid' }],
  apply: (draft, payload) => {
    const { automation, reducedMotion } = PreferencesSchema.parse(payload);
    draft.automation = automation;
    draft.reducedMotion = reducedMotion;
    return `Settings: ${automation === 'assisted' ? 'Assisted' : 'Manual'} · reduced motion ${reducedMotion ? 'on' : 'off'}`;
  },
};
