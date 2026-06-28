import { describe, expect, it, vi } from 'vitest';
import { resolveOptions } from './options';
import type { ClientStore, TokenStore, ValidateUser } from './types';

const validateUser: ValidateUser = vi.fn();
const tokenStore = {} as TokenStore;
const clientStore = {} as ClientStore;

const base = { validateUser, tokenStore };

describe('resolveOptions', () => {
  it('applies every default when behavior is omitted', () => {
    const r = resolveOptions(base);
    expect(r.accessTokenTtl).toBe(3600);
    expect(r.refreshTokenTtl).toBe(1209600);
    expect(r.enableRefreshToken).toBe(true);
    expect(r.tokenBytes).toBe(32);
    expect(r.attachTo).toBe('user');
    expect(r.requireClient).toBe(false);
    expect(r.confidentialClients).toBe(false);
  });

  it('respects each behavior override', () => {
    const r = resolveOptions({
      ...base,
      accessTokenTtl: 60,
      refreshTokenTtl: 120,
      enableRefreshToken: false,
      tokenBytes: 64,
      attachTo: 'principal'
    });
    expect(r.accessTokenTtl).toBe(60);
    expect(r.refreshTokenTtl).toBe(120);
    expect(r.enableRefreshToken).toBe(false);
    expect(r.tokenBytes).toBe(64);
    expect(r.attachTo).toBe('principal');
  });

  it('confidentialClients:true forces requireClient:true even when requireClient is omitted', () => {
    const r = resolveOptions({ ...base, confidentialClients: true });
    expect(r.confidentialClients).toBe(true);
    expect(r.requireClient).toBe(true);
  });

  it('confidentialClients:true forces requireClient:true even when requireClient is false', () => {
    const r = resolveOptions({ ...base, confidentialClients: true, requireClient: false });
    expect(r.requireClient).toBe(true);
  });

  it('requireClient:true alone keeps confidentialClients false', () => {
    const r = resolveOptions({ ...base, requireClient: true });
    expect(r.requireClient).toBe(true);
    expect(r.confidentialClients).toBe(false);
  });

  it('leaves requireClient false when both flags are omitted', () => {
    expect(resolveOptions(base).requireClient).toBe(false);
  });

  it('passes through validateUser, tokenStore, and clientStore', () => {
    const r = resolveOptions({ ...base, clientStore });
    expect(r.validateUser).toBe(validateUser);
    expect(r.tokenStore).toBe(tokenStore);
    expect(r.clientStore).toBe(clientStore);
  });

  it('leaves clientStore undefined when not supplied', () => {
    expect(resolveOptions(base).clientStore).toBeUndefined();
  });
});
