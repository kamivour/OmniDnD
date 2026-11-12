/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, type ThemeInfo } from './themes';

// Vitest does not load CSS, so read the files directly.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const indexCss = read('../index.css');
const tokensCss = read('./tokens.css');
const effectsCss = read('./effects.css');
const themeFiles: Record<string, string> = Object.fromEntries(
  readdirSync(new URL('./themes/', import.meta.url))
    .filter((name) => name.endsWith('.css'))
    .map((name) => [`./themes/${name}`, read(`./themes/${name}`)]),
);

/** Every theme sets all of these, so a preview inside another theme shows its own colours. */
const COLOR_TOKENS = [
  'bg',
  'surface',
  'surface-2',
  'border',
  'text',
  'text-muted',
  'accent',
  'magic',
  'danger',
  'heal',
  'temp',
  'warn',
  'type-damage',
  'type-control',
  'type-healing',
  'type-buff',
  'type-debuff',
  'type-utility',
] as const;

/** Colours used as text or icons on cards. Each must reach WCAG AA (4.5:1) on every surface. */
const TEXT_TOKENS = COLOR_TOKENS.filter(
  (token) => !['bg', 'surface', 'surface-2', 'border'].includes(token),
);

/** Pairs that carry different meanings and must not look alike. */
const DISTINCT: readonly [string, string][] = [
  ['danger', 'heal'],
  ['danger', 'warn'],
  ['danger', 'accent'],
  ['heal', 'warn'],
  ['magic', 'danger'],
];

function themeCss(id: string): string {
  return id === 'dark' ? tokensCss : (themeFiles[`./themes/${id}.css`] ?? '');
}

/** The first rule block whose selector names this theme. */
function tokens(id: string): Record<string, string> {
  const css = themeCss(id);
  const at = css.indexOf(`[data-theme='${id}']`);
  if (at < 0) return {};
  const block = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries(
    [...block.matchAll(/--omni-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

type Rgba = [number, number, number, number];

function parse(color: string): Rgba {
  const hex = /^#([\da-f]{3,8})$/i.exec(color)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(
    color,
  );
  if (!rgb) throw new Error(`Unreadable colour: ${color}`);
  const alpha = rgb[4] ?? '1';
  return [
    Number(rgb[1]),
    Number(rgb[2]),
    Number(rgb[3]),
    alpha.endsWith('%') ? Number(alpha.slice(0, -1)) / 100 : Number(alpha),
  ];
}

/** See-through colours (glass themes) are judged over the page background. */
function over(color: Rgba, base: Rgba): Rgba {
  const a = color[3];
  return [0, 1, 2].map((i) => color[i]! * a + base[i]! * (1 - a)).concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
}

function contrast(a: Rgba, b: Rgba): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** CIE76 colour difference in Lab space. */
function deltaE(a: Rgba, b: Rgba): number {
  const lab = ([r, g, b]: Rgba) => {
    const lin = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const [lr, lg, lb] = lin as [number, number, number];
    const xyz = [
      (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047,
      lr * 0.2126 + lg * 0.7152 + lb * 0.0722,
      (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883,
    ].map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)) as [number, number, number];
    return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
  };
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
}

describe('theme registry', () => {
  it('has unique ids and names', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length);
  });

  it('gives every theme a CSS file that the app imports, and no file without a theme', () => {
    for (const theme of THEMES.filter((t) => t.id !== 'dark')) {
      expect(themeFiles, theme.id).toHaveProperty(`./themes/${theme.id}.css`);
      expect(indexCss, theme.id).toContain(`@import './theme/themes/${theme.id}.css';`);
    }
    const ids: readonly string[] = THEMES.map((t) => t.id);
    for (const file of Object.keys(themeFiles))
      expect(ids).toContain(file.replace('./themes/', '').replace('.css', ''));
  });

  it('declares the colour scheme that the CSS sets', () => {
    for (const theme of THEMES as readonly ThemeInfo[])
      expect(themeCss(theme.id), theme.id).toMatch(
        new RegExp(`\\[data-theme='${theme.id}'\\][^{]*\\{\\s*color-scheme: ${theme.scheme};`),
      );
  });
});

/** Plain rules (selector and body); nested at-rules give their inner rules. */
function rules(css: string): { selector: string; body: string }[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));
}

describe('theme effects', () => {
  const allCss = [effectsCss, ...Object.values(themeFiles)].join('\n');

  it('animates only at the full effect level (tap feedback excepted)', () => {
    for (const { selector, body } of rules(allCss))
      if (/(^|[;\s])animation(-name)?\s*:/.test(body) && !/animation:\s*none/.test(body))
        expect(selector).toMatch(/\[data-fx='full'\]|omni-ripple|omni-sheen/);
  });

  it('gives every theme with a title or background effect its CSS', () => {
    for (const theme of THEMES as readonly ThemeInfo[]) {
      const css = themeCss(theme.id);
      if (theme.title) expect(css, theme.id).toMatch(/\.omni-title/);
      if (theme.ambient) expect(css, theme.id).toContain(`[data-ambient='${theme.ambient}']`);
    }
  });
});

describe.each(THEMES.map((t) => t.id))('%s theme colours', (id) => {
  const set = tokens(id);

  it('sets every colour token', () => {
    for (const token of COLOR_TOKENS) expect(set, token).toHaveProperty(token);
    expect(parse(set.bg!)[3], 'bg is solid').toBe(1);
  });

  it('keeps text readable on every surface (WCAG AA)', () => {
    const bg = parse(set.bg!);
    const surfaces = {
      bg,
      surface: over(parse(set.surface!), bg),
      'surface-2': over(parse(set['surface-2']!), bg),
    };
    for (const token of TEXT_TOKENS)
      for (const [name, surface] of Object.entries(surfaces))
        expect(
          contrast(over(parse(set[token]!), surface), surface),
          `${token} on ${name}`,
        ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps meaning colours apart', () => {
    for (const [a, b] of DISTINCT)
      expect(deltaE(parse(set[a]!), parse(set[b]!)), `${a} vs ${b}`).toBeGreaterThanOrEqual(20);
  });
});
