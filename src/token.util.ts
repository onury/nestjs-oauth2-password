import { createHash, randomBytes } from 'node:crypto';

/**
 * Mint a high-entropy opaque token. Default 32 bytes → a 43-char URL-safe
 * string (256 bits). This is the value handed to the client *and* to your
 * {@link TokenStore}; the store decides whether to persist it raw or hashed
 * (see {@link hashToken}).
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Optional helper: SHA-256 a token to a hex digest. Use it in your store so a
 * database leak never exposes usable tokens — persist `hashToken(token)` and
 * look up by the same. Opaque tokens carry no claims, so a fast hash is
 * sufficient (unlike passwords).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compute an absolute expiry `ttlSeconds` from `now` (default: current time). */
export function expiryDate(ttlSeconds: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

/** True if `date` is at or before `now` — i.e. the token has expired. */
export function isExpired(date: Date, now: Date = new Date()): boolean {
  return date.getTime() <= now.getTime();
}
