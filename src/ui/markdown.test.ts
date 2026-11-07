import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, safeUrl } from './markdown';

describe('journal markdown', () => {
  it('reads headings, lists, quotes and paragraphs with line breaks', () => {
    const blocks = parseMarkdown('# Title\nline one\nline two\n\n- a\n- b\n\n1. x\n\n> said');
    expect(blocks.map((b) => b.t)).toEqual(['h', 'p', 'ul', 'ol', 'quote']);
    expect(blocks[1]).toEqual({
      t: 'p',
      c: [{ t: 'text', v: 'line one' }, { t: 'br' }, { t: 'text', v: 'line two' }],
    });
  });

  it('formats bold, italic and code, and leaves stray marks alone', () => {
    expect(parseInline('**hi** *there* `x`').map((n) => n.t)).toEqual([
      'b',
      'text',
      'i',
      'text',
      'code',
    ]);
    expect(parseInline('2 * 3 * 4')).toEqual([{ t: 'text', v: '2 * 3 * 4' }]);
  });

  it('keeps typed HTML as text', () => {
    const [block] = parseMarkdown('<img src=x onerror=alert(1)> <script>x</script>');
    expect(block).toEqual({
      t: 'p',
      c: [{ t: 'text', v: '<img src=x onerror=alert(1)> <script>x</script>' }],
    });
  });

  it('links only http and https', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,x')).toBeUndefined();
    expect(parseInline('[a](javascript:alert(1))').some((n) => n.t === 'a')).toBe(false);
    expect(parseInline('[a](https://example.com)')[0]).toMatchObject({
      t: 'a',
      href: 'https://example.com/',
    });
  });
});
