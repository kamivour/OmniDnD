const DAY = 24 * 60 * 60 * 1000;
export const REMINDER_DAYS = 14;

/** Remind when there is something to lose and no backup file was saved in the last two weeks. */
export function backupReminder(
  lastBackupAt: string | undefined,
  now: Date,
  hasCharacters: boolean,
): string | undefined {
  if (!hasCharacters) return undefined;
  if (!lastBackupAt) return 'You have not saved a backup file yet.';
  const age = now.getTime() - Date.parse(lastBackupAt);
  if (Number.isNaN(age) || age > REMINDER_DAYS * DAY)
    return `Your last backup file is more than ${REMINDER_DAYS} days old.`;
  return undefined;
}
