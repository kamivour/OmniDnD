import { useAccountSession } from '../../sync/service';
import { Avatar } from '../components/Avatar';

/** The signed-in account's picture for the top bar; the mask while signed out. */
export default function SessionAvatar({ size }: { size: number }) {
  const { status, avatar } = useAccountSession();
  return <Avatar avatar={status === 'signed-in' ? avatar : null} size={size} />;
}
