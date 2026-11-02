import { Link, useParams } from 'react-router';
import { GAME_ICONS } from '../icons/game-icons';
import { cx } from '../cx';

const sourceIcons = [
  ...new Map(
    Object.values(GAME_ICONS).map(({ author, name }) => [`${author}/${name}`, { author, name }]),
  ).values(),
].sort((a, b) => a.author.localeCompare(b.author) || a.name.localeCompare(b.name));
const linkClass = 'break-words text-accent underline underline-offset-2';

/** Local attribution stays readable without fetching external sites. */
export function CreditsScreen() {
  const { characterId } = useParams();
  const base = characterId ? `/characters/${encodeURIComponent(characterId)}` : '';
  return (
    <section
      className={cx(
        'mx-auto flex min-w-0 max-w-3xl flex-col gap-6 text-sm',
        characterId && 'px-4 py-4 lg:px-6',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl">Credits</h1>
        <Link to={`${base}/reference`} className="inline-flex min-h-11 items-center text-accent">
          Back to Reference
        </Link>
      </header>
      <section aria-labelledby="credits-srd" className="flex flex-col gap-3">
        <h2 id="credits-srd" className="text-base font-semibold">
          SRD 5.1
        </h2>
        <p className="break-words text-text-muted">
          This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by
          Wizards of the Coast LLC and available at{' '}
          <a
            className={linkClass}
            href="https://dnd.wizards.com/resources/systems-reference-document"
            target="_blank"
            rel="noreferrer"
          >
            https://dnd.wizards.com/resources/systems-reference-document
          </a>
          . The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License
          available at{' '}
          <a
            className={linkClass}
            href="https://creativecommons.org/licenses/by/4.0/legalcode"
            target="_blank"
            rel="noreferrer"
          >
            https://creativecommons.org/licenses/by/4.0/legalcode
          </a>
          .
        </p>
        <p className="text-text-muted">
          2014 data is imported from{' '}
          <a
            className={linkClass}
            href="https://github.com/5e-bits/5e-database/tree/a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f/src/2014/en"
            target="_blank"
            rel="noreferrer"
          >
            5e-bits/5e-database
          </a>
          . OmniDnD maps that data to its own schema and adds original summaries and mechanics.
          Non-SRD summaries are written in our own words.
        </p>
      </section>
      <section aria-labelledby="credits-game-icons" className="flex flex-col gap-3">
        <h2 id="credits-game-icons" className="text-base font-semibold">
          game-icons.net
        </h2>
        <p className="text-text-muted">
          Content icons are by the authors listed below, from{' '}
          <a className={linkClass} href="https://game-icons.net/" target="_blank" rel="noreferrer">
            game-icons.net
          </a>
          , licensed under{' '}
          <a
            className={linkClass}
            href="https://creativecommons.org/licenses/by/3.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 3.0
          </a>
          . SVG paths are combined, their backgrounds removed, and their colors set by the app.
        </p>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {sourceIcons.map(({ author, name }) => (
            <li key={`${author}/${name}`} className="min-w-0">
              <a
                className={linkClass}
                href={`https://game-icons.net/1x1/${author}/${name}.html`}
                target="_blank"
                rel="noreferrer"
              >
                {name.replaceAll('-', ' ')}
              </a>{' '}
              — {author}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="credits-lucide" className="flex flex-col gap-3">
        <h2 id="credits-lucide" className="text-base font-semibold">
          Lucide
        </h2>
        <p className="text-text-muted">
          Interface icons are from{' '}
          <a className={linkClass} href="https://lucide.dev/" target="_blank" rel="noreferrer">
            Lucide
          </a>
          , copyright 2026 Lucide Icons and Contributors, under the ISC license. Feather-derived
          icons also carry Cole Bemis’s MIT notice.{' '}
          <a className={linkClass} href="/licenses/lucide.txt" target="_blank" rel="noreferrer">
            Lucide license and notices
          </a>
          .
        </p>
      </section>
      <section aria-labelledby="credits-fonts" className="flex flex-col gap-3">
        <h2 id="credits-fonts" className="text-base font-semibold">
          Fonts
        </h2>
        <p className="text-text-muted">
          Inter, copyright 2016 The Inter Project Authors, and Cinzel, copyright 2020 The Cinzel
          Project Authors, are bundled locally under the SIL Open Font License 1.1.
        </p>
        <div className="flex flex-wrap gap-4">
          <a className={linkClass} href="/licenses/inter.txt" target="_blank" rel="noreferrer">
            Inter license
          </a>
          <a className={linkClass} href="/licenses/cinzel.txt" target="_blank" rel="noreferrer">
            Cinzel license
          </a>
        </div>
      </section>
      <p className="text-xs text-text-muted">External links open in a new tab.</p>
    </section>
  );
}
