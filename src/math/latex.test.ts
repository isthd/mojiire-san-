import { describe, expect, it } from 'vitest';
import { isBlankLatex, normalizeLatex } from './latex';

describe('normalizeLatex', () => {
  it('turns empty placeholders into squares', () => {
    expect(normalizeLatex('\\frac{\\placeholder{}}{2}')).toBe('\\frac{\\square }{2}');
  });
  it('keeps filled placeholder content', () => {
    expect(normalizeLatex('\\placeholder[a]{x}+1')).toBe('x+1');
  });
  it('maps MathLive specific macros', () => {
    expect(normalizeLatex('\\int x\\,\\differentialD x')).toBe('\\int x\\,\\mathrm{d} x');
  });
  it('handles blanks inside text and double primes', () => {
    expect(normalizeLatex('\\text{\\placeholder{}}')).toBe('\\text{□}');
    expect(normalizeLatex("f^{\\doubleprime}(x)")).toBe('f^{\\prime\\prime }(x)');
  });
  it('detects blank input', () => {
    expect(isBlankLatex('  ')).toBe(true);
    expect(isBlankLatex('\\placeholder{}')).toBe(true);
    expect(isBlankLatex('x^2')).toBe(false);
  });
});
