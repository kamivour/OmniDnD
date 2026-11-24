import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { IndexEntry } from './names.ts';
import { blockKey } from './overrides.ts';
import type { compareReprints } from './reprints.ts';
import type { indexCoverage, ValidatedCreature } from './validate.ts';

const exec = promisify(execFile);
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );

type Coverage = ReturnType<typeof indexCoverage>;
export interface ReviewReport {
  book: string;
  records: ValidatedCreature[];
  coverage: Coverage;
  reprints?: ReturnType<typeof compareReprints>;
}

export function reviewPages(report: ReviewReport, offset: number, pageCount: number): number[] {
  const pages = report.records
    .filter(({ findings }) => findings.length)
    .map(({ creature }) => creature.page);
  for (const { page } of report.coverage.missing) {
    if (page !== undefined) pages.push(page + offset);
  }
  for (const duplicates of report.coverage.duplicates) {
    pages.push(...duplicates.map(({ page }) => page));
  }
  return [...new Set(pages)].filter((page) => page > 0 && page <= pageCount).sort((a, b) => a - b);
}

/** Render each flagged PDF page once and keep the image beside the private report. */
export async function renderPages(work: string, pdf: string, pages: readonly number[]) {
  pdf = resolve(pdf);
  const { size, mtimeMs } = statSync(pdf);
  const stamp = createHash('sha256')
    .update(JSON.stringify([pdf, size, mtimeMs]))
    .digest('hex')
    .slice(0, 16);
  const subdir = `renders/${stamp}`;
  mkdirSync(join(work, subdir), { recursive: true });
  const images = new Map<number, string>();
  const remaining = [...pages];
  await Promise.all(
    Array.from({ length: Math.min(4, pages.length) }, async () => {
      let page: number | undefined;
      while ((page = remaining.shift()) !== undefined) {
        const path = `${subdir}/page-${page}`;
        const image = `${path}.png`;
        if (!existsSync(join(work, image)))
          await exec(
            'pdftoppm',
            [
              '-f',
              String(page),
              '-l',
              String(page),
              '-r',
              '120',
              '-png',
              '-singlefile',
              pdf,
              join(work, path),
            ],
            { windowsHide: true },
          );
        images.set(page, image);
      }
    }),
  );
  return images;
}

export function reviewHtml(
  report: ReviewReport,
  images: ReadonlyMap<number, string>,
  offset: number,
) {
  const preview = (page: number) => {
    const src = images.get(page);
    return src
      ? `<details><summary>PDF page ${page}</summary><a href="${escape(src)}"><img loading="lazy" alt="PDF page ${page}" src="${escape(src)}"></a></details>`
      : '';
  };
  const missing = ({ name, page }: IndexEntry) =>
    `<li>${escape(name)}${page === undefined ? '' : ` · page ${page}${preview(page + offset)}`}</li>`;
  const rows = report.records
    .filter(({ findings }) => findings.length)
    .map(
      ({ creature, findings, overrideKey }) => `
    <article>
      <h2>${escape(creature.name ?? creature.heading ?? 'Unnamed block')}</h2>
      <p>Printed page ${escape(creature.printed ?? creature.page)} · override key <code>${escape(overrideKey ?? blockKey(creature))}</code></p>
      <ul>${findings.map(({ severity, code, message }) => `<li><strong>${severity}</strong> <code>${escape(code)}</code> ${escape(message)}</li>`).join('')}</ul>
      <details><summary>Parsed fields</summary><pre>${escape(JSON.stringify(creature, null, 2))}</pre></details>
      ${preview(creature.page)}
    </article>`,
    )
    .join('');
  const reprints = report.reprints
    ? `<details><summary>${report.reprints.changed.length}/${report.reprints.matched} matched blocks differ from MPMM</summary><pre>${escape(JSON.stringify(report.reprints.changed, null, 2))}</pre></details>`
    : '';
  const duplicates = report.coverage.duplicates
    .map(
      (copies) =>
        `<li>${escape(copies[0]?.name)}${copies.map((copy) => ` · ${escape(copy.printed ?? copy.page)}${preview(copy.page)}`).join('')}</li>`,
    )
    .join('');
  const blocking = report.records
    .flatMap(({ findings }) => findings)
    .filter(({ severity }) => severity === 'blocking').length;
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(report.book)} monster review</title>
<style>
  html {color-scheme:light dark;font:1rem/1.5 system-ui} body {max-width:72rem;margin:auto;padding:1rem}
  article, section {border:1px solid GrayText;border-radius:.5rem;padding:1rem;margin:1rem 0}
  pre,code {white-space:pre-wrap;overflow-wrap:anywhere} img {display:block;max-width:100%;height:auto}
  details {margin:.5rem 0} summary {cursor:pointer;padding:.35rem 0} ul {padding-left:1.25rem}
</style>
<main>
<h1>${escape(report.book)} monster review</h1>
<p>${report.coverage.matched}/${report.coverage.expected} index entries matched · ${blocking} blocking block findings</p>
<section><h2>Missing index entries</h2><ul>${report.coverage.missing.map(missing).join('')}</ul></section>
<section><h2>Duplicate names</h2><ul>${duplicates}</ul></section>
${reprints}
${rows}
</main></html>`;
}
