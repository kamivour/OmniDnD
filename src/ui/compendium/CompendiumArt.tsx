import { useState } from 'react';
import type { CatalogEntry } from '../../engine/catalog';
import type { ItemDef } from '../../engine/schema';
import { Icon } from '../components/Icon';
import { cx } from '../cx';
import { entryArt } from './compendium-art';

export function CompendiumArt({
  entry,
  base,
  large = false,
}: {
  entry: CatalogEntry;
  base?: ItemDef;
  large?: boolean;
}) {
  const { id, fallback, artwork, tier } = entryArt(entry, base);
  const [failed, setFailed] = useState<string>();
  return (
    <span
      aria-hidden="true"
      data-tier={tier}
      data-icon={fallback}
      className={cx(
        'compendium-art grid shrink-0 place-items-center overflow-hidden rounded-btn border',
        large ? 'size-20 sm:size-24' : 'size-10',
      )}
    >
      {artwork && failed !== artwork ? (
        <img
          src={artwork}
          alt=""
          loading={large ? 'eager' : 'lazy'}
          onError={() => setFailed(artwork)}
          className={cx('object-contain', large ? 'size-16' : 'size-8')}
        />
      ) : (
        <Icon id={id} fallback={fallback} size={large ? 40 : 20} />
      )}
    </span>
  );
}
