import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { expiryDate, generateToken, hashToken, isExpired } from './token.util';

describe('generateToken', () => {
  it('defaults to 32 bytes → a 43-char base64url string', () => {
    const token = generateToken();
    expect(token).toHaveLength(43);
  });

  it('honors a custom byte length', () => {
    // 16 bytes → ceil(16 / 3) * 4 = 24, minus base64url padding (16 % 3 === 1 → 2 chars dropped) = 22.
    expect(generateToken(16)).toHaveLength(22);
    // 48 bytes → 64 base64 chars with no padding.
    expect(generateToken(48)).toHaveLength(64);
  });

  it('produces a different token on each call', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('uses only the URL-safe base64 charset (no +, /, or =)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('hashToken', () => {
  it('returns a 64-char lowercase hex sha256 digest', () => {
    const hash = hashToken('abc');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches a reference sha256 hex digest', () => {
    const expected = createHash('sha256').update('hello').digest('hex');
    expect(hashToken('hello')).toBe(expected);
  });

  it('is deterministic for the same input', () => {
    expect(hashToken('same')).toBe(hashToken('same'));
  });

  it('differs for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('expiryDate', () => {
  it('computes now + ttl using an explicit now', () => {
    const now = new Date('2020-01-01T00:00:00.000Z');
    expect(expiryDate(3600, now).toISOString()).toBe('2020-01-01T01:00:00.000Z');
  });

  it('adds exactly ttlSeconds * 1000 milliseconds', () => {
    const now = new Date(1_000_000);
    expect(expiryDate(5, now).getTime()).toBe(1_000_000 + 5000);
  });

  it('defaults now to the current time when omitted', () => {
    const before = Date.now();
    const result = expiryDate(10).getTime();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before + 10_000);
    expect(result).toBeLessThanOrEqual(after + 10_000);
  });
});

describe('isExpired', () => {
  const now = new Date('2020-06-01T00:00:00.000Z');

  it('returns true for a date in the past', () => {
    expect(isExpired(new Date(now.getTime() - 1000), now)).toBe(true);
  });

  it('returns false for a date in the future', () => {
    expect(isExpired(new Date(now.getTime() + 1000), now)).toBe(false);
  });

  it('returns true at exactly now (boundary: <= not <)', () => {
    expect(isExpired(new Date(now.getTime()), now)).toBe(true);
  });

  it('defaults now to the current time when omitted', () => {
    expect(isExpired(new Date(Date.now() - 10_000))).toBe(true);
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false);
  });
});
