import { useRef, useState } from 'react';
import { Camera, ImageUp, Trash2 } from 'lucide-react';
import { AVATAR_MAX } from '../../sync/avatar';
import { saveAvatar, useAccountSession } from '../../sync/service';
import { Avatar } from '../components/Avatar';
import { resizePortrait } from '../portrait';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

/** Shows the account's picture and lets the owner upload, take or remove one. */
export function AvatarPicker() {
  const { status, avatar, displayName } = useAccountSession();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const signedIn = status === 'signed-in';
  const canEdit = signedIn && typeof displayName === 'string' && avatar !== undefined;

  const save = async (work: () => Promise<string | null>, done: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveAvatar(await work());
      setNotice(done);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this picture.');
    } finally {
      setBusy(false);
    }
  };
  const onFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file)
      void save(() => resizePortrait(file, { size: 256, maxLength: AVATAR_MAX }), 'Picture saved.');
  };

  return (
    <div className="flex flex-wrap items-center gap-4" aria-busy={busy}>
      <Avatar
        avatar={avatar}
        size={96}
        label={avatar ? 'Your profile picture' : 'Default mask picture'}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-display text-lg break-words">
          {signedIn
            ? displayName || 'No display name yet'
            : status === 'signed-out'
              ? 'Not signed in'
              : ''}
        </p>
        {signedIn && displayName === null && (
          <p className="text-sm text-text-muted">Choose a display name below to add a picture.</p>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className={button}
            >
              <ImageUp size={16} aria-hidden />
              Choose picture
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraInput.current?.click()}
              className={button}
            >
              <Camera size={16} aria-hidden />
              Take photo
            </button>
            {avatar && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(() => Promise.resolve(null), 'Picture removed.')}
                className={button}
              >
                <Trash2 size={16} aria-hidden />
                Remove
              </button>
            )}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          aria-label="Profile picture file"
          className="hidden"
          onChange={(event) => onFile(event.currentTarget)}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="user"
          aria-label="Profile photo from camera"
          className="hidden"
          onChange={(event) => onFile(event.currentTarget)}
        />
        {canEdit && (
          <p className="text-xs text-text-muted">
            Cropped to a small square. Party members in your shared campaigns can see it.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-heal">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
