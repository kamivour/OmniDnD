import { cx } from '../cx';
import { isPortrait } from '../portrait';
import { Icon } from './Icon';

/**
 * The character's own picture when they chose one; otherwise their own icon, then the
 * icon of their first class.
 */
export function CharacterPortrait({
  id,
  portrait,
  classId,
  size,
  className,
}: {
  id: string;
  portrait: string | undefined;
  classId: string | undefined;
  size: 20 | 40;
  className?: string;
}) {
  if (!isPortrait(portrait)) {
    return <Icon id={`character.${id}`} fallback={classId} size={size} className={className} />;
  }
  return (
    <img
      src={portrait}
      alt=""
      width={size}
      height={size}
      className={cx('shrink-0 rounded-full object-cover', className)}
      style={{ width: size, height: size }}
    />
  );
}
