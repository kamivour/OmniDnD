import { NAME_MAX, NAME_MIN } from '../../sync/display-name';
import { Field, inputClass } from '../components/fields';
import { cx } from '../cx';
import type { NameCheck } from './name-check';

const STATUS: Partial<Record<NameCheck['state'], string>> = {
  checking: 'Checking…',
  free: 'Available',
  same: 'This is your name now.',
};

/** Display name input with the live check underneath. Never autofills a stored nickname. */
export function NameField({
  id,
  label = 'Display name',
  value,
  onChange,
  check,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  check: NameCheck;
}) {
  const status = 'message' in check ? check.message : STATUS[check.state];
  const bad = check.state === 'invalid' || check.state === 'taken';
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={`${NAME_MIN} to ${NAME_MAX} characters. Your party sees this name, never your email.`}
    >
      <input
        id={id}
        type="text"
        maxLength={NAME_MAX}
        autoComplete="off"
        aria-invalid={bad || undefined}
        aria-describedby={status ? `${id}-status` : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
      {status && (
        <p
          id={`${id}-status`}
          aria-live="polite"
          className={cx('text-xs', bad ? 'text-danger' : 'text-text-muted')}
        >
          {status}
        </p>
      )}
    </Field>
  );
}
