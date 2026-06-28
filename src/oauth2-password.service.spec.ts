import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuth2Exception } from './oauth2.error';
import { OAuth2PasswordService } from './oauth2-password.service';
import { type OAuth2PasswordBehavior, resolveOptions } from './options';
import type {
  ClientStore,
  IssuedAccessToken,
  IssuedRefreshToken,
  StoredAccessToken,
  StoredRefreshToken,
  TokenStore
} from './types';

const NOW = new Date('2020-01-01T00:00:00.000Z');
const USER = { id: 'u1' };
const CLIENT = { id: 'c1' };
const RECORD_CLIENT = { id: 'record-client' };

type Behavior = OAuth2PasswordBehavior;

function makeStore() {
  return {
    saveAccessToken: vi.fn<TokenStore['saveAccessToken']>(),
    saveRefreshToken: vi.fn<TokenStore['saveRefreshToken']>(),
    findAccessToken: vi.fn<TokenStore['findAccessToken']>(() => null),
    findRefreshToken: vi.fn<TokenStore['findRefreshToken']>(() => null),
    revokeAccessToken: vi.fn<TokenStore['revokeAccessToken']>(),
    revokeRefreshToken: vi.fn<TokenStore['revokeRefreshToken']>()
  };
}

function makeClientStore() {
  return {
    findClient: vi.fn<ClientStore['findClient']>(() => CLIENT),
    verifySecret: vi.fn<ClientStore['verifySecret']>(() => true)
  };
}

function build(
  behavior: Behavior = {},
  opts: {
    validateUser?: (...a: unknown[]) => unknown;
    store?: ReturnType<typeof makeStore>;
    clientStore?: ReturnType<typeof makeClientStore> | undefined;
    withClientStore?: boolean;
  } = {}
) {
  const store = opts.store ?? makeStore();
  const validateUser = vi.fn(opts.validateUser ?? (() => USER));
  const clientStore =
    opts.clientStore !== undefined
      ? opts.clientStore
      : opts.withClientStore
        ? makeClientStore()
        : undefined;
  const options = resolveOptions({
    validateUser,
    tokenStore: store as unknown as TokenStore,
    clientStore: clientStore as unknown as ClientStore | undefined,
    accessTokenTtl: 100,
    refreshTokenTtl: 200,
    ...behavior
  });
  const service = new OAuth2PasswordService(options);
  return { service, store, validateUser, clientStore };
}

async function grab(promise: Promise<unknown>): Promise<OAuth2Exception> {
  try {
    await promise;
  } catch (e) {
    return e as OAuth2Exception;
  }
  throw new Error('expected the promise to reject');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('token() dispatch', () => {
  it("routes grant_type 'password' to the password grant", async () => {
    const { service, validateUser } = build();
    const res = await service.token({ grant_type: 'password', username: 'a', password: 'b' });
    expect(validateUser).toHaveBeenCalledWith('a', 'b', null);
    expect(res.access_token).toBeTypeOf('string');
  });

  it("routes grant_type 'refresh_token' to the refresh grant", async () => {
    const store = makeStore();
    store.findRefreshToken.mockReturnValue({
      user: USER,
      client: RECORD_CLIENT,
      expiryDate: new Date(NOW.getTime() + 10_000),
      accessToken: 'old-access'
    } satisfies StoredRefreshToken);
    const { service } = build({}, { store });
    const res = await service.token({ grant_type: 'refresh_token', refresh_token: 'rt' });
    expect(store.revokeRefreshToken).toHaveBeenCalledWith('rt');
    expect(res.access_token).toBeTypeOf('string');
  });

  it('throws unsupported_grant_type for an unknown grant_type', async () => {
    const { service } = build();
    const err = await grab(service.token({ grant_type: 'client_credentials' }));
    expect(err).toBeInstanceOf(OAuth2Exception);
    expect(err.error).toBe('unsupported_grant_type');
    expect(err.description).toBe("grant_type 'client_credentials' is not supported");
  });
});

describe('password grant', () => {
  it('throws invalid_request when username is missing', async () => {
    const { service } = build();
    const err = await grab(service.token({ grant_type: 'password', password: 'b' }));
    expect(err.error).toBe('invalid_request');
    expect(err.description).toBe('username and password are required');
  });

  it('throws invalid_request when password is missing', async () => {
    const { service } = build();
    const err = await grab(service.token({ grant_type: 'password', username: 'a' }));
    expect(err.error).toBe('invalid_request');
  });

  it('throws invalid_grant when validateUser returns null', async () => {
    const { service } = build({}, { validateUser: () => null });
    const err = await grab(
      service.token({ grant_type: 'password', username: 'a', password: 'bad' })
    );
    expect(err.error).toBe('invalid_grant');
    expect(err.description).toBe('invalid username or password');
  });

  it('issues a full token pair on success and persists both tokens', async () => {
    const { service, store } = build();
    const res = await service.token({
      grant_type: 'password',
      username: 'a',
      password: 'b',
      scope: 'read'
    });

    expect(res.token_type).toBe('Bearer');
    expect(res.expires_in).toBe(100);
    expect(res.access_token).toBeTypeOf('string');
    expect(res.refresh_token).toBeTypeOf('string');
    expect(res.scope).toBe('read');
    expect(res.access_token).not.toBe(res.refresh_token);

    const access = store.saveAccessToken.mock.calls[0][0] as IssuedAccessToken;
    expect(access).toEqual({
      token: res.access_token,
      user: USER,
      client: null,
      scope: 'read',
      expiryDate: new Date(NOW.getTime() + 100_000)
    });

    const refresh = store.saveRefreshToken.mock.calls[0][0] as IssuedRefreshToken;
    expect(refresh).toEqual({
      token: res.refresh_token,
      accessToken: res.access_token,
      user: USER,
      client: null,
      scope: 'read',
      expiryDate: new Date(NOW.getTime() + 200_000)
    });
  });

  it('omits scope from the response and saved tokens when not requested', async () => {
    const { service, store } = build();
    const res = await service.token({ grant_type: 'password', username: 'a', password: 'b' });
    expect('scope' in res).toBe(false);
    const access = store.saveAccessToken.mock.calls[0][0];
    expect(access.scope).toBeUndefined();
  });

  it('omits the refresh token entirely when enableRefreshToken is false', async () => {
    const { service, store } = build({ enableRefreshToken: false });
    const res = await service.token({ grant_type: 'password', username: 'a', password: 'b' });
    expect('refresh_token' in res).toBe(false);
    expect(store.saveRefreshToken).not.toHaveBeenCalled();
    expect(store.saveAccessToken).toHaveBeenCalledTimes(1);
  });
});

describe('refresh grant', () => {
  const validRecord = (over: Partial<StoredRefreshToken> = {}): StoredRefreshToken => ({
    user: USER,
    client: RECORD_CLIENT,
    scope: 'record-scope',
    expiryDate: new Date(NOW.getTime() + 10_000),
    accessToken: 'old-access',
    ...over
  });

  it('throws invalid_request when refresh_token is missing', async () => {
    const { service } = build();
    const err = await grab(service.token({ grant_type: 'refresh_token' }));
    expect(err.error).toBe('invalid_request');
    expect(err.description).toBe('refresh_token is required');
  });

  it('throws invalid_grant for an unknown refresh token', async () => {
    const store = makeStore();
    store.findRefreshToken.mockReturnValue(null);
    const { service } = build({}, { store });
    const err = await grab(service.token({ grant_type: 'refresh_token', refresh_token: 'rt' }));
    expect(err.error).toBe('invalid_grant');
    expect(err.description).toBe('invalid or expired refresh token');
  });

  it('throws invalid_grant for an expired refresh token', async () => {
    const store = makeStore();
    store.findRefreshToken.mockReturnValue(
      validRecord({ expiryDate: new Date(NOW.getTime() - 1) })
    );
    const { service } = build({}, { store });
    const err = await grab(service.token({ grant_type: 'refresh_token', refresh_token: 'rt' }));
    expect(err.error).toBe('invalid_grant');
  });

  it('revokes the old access token and the presented refresh token, then issues a fresh pair', async () => {
    const store = makeStore();
    store.findRefreshToken.mockReturnValue(validRecord());
    const { service } = build({}, { store });
    const res = await service.token({ grant_type: 'refresh_token', refresh_token: 'rt' });

    expect(store.revokeAccessToken).toHaveBeenCalledWith('old-access');
    expect(store.revokeRefreshToken).toHaveBeenCalledWith('rt');
    expect(res.access_token).toBeTypeOf('string');
    expect(res.refresh_token).toBeTypeOf('string');
    expect(res.access_token).not.toBe('old-access');
  });

  it('falls back to the record client and record scope when none are resolved/requested', async () => {
    const store = makeStore();
    store.findRefreshToken.mockReturnValue(validRecord());
    const { service } = build({}, { store });
    await service.token({ grant_type: 'refresh_token', refresh_token: 'rt' });

    const access = store.saveAccessToken.mock.calls[0][0];
    expect(access.client).toBe(RECORD_CLIENT);
    expect(access.scope).toBe('record-scope');
  });

  it('prefers the request scope over the record scope when provided', async () => {
    const store = makeStore();
    store.findRefreshToken.mockReturnValue(validRecord());
    const { service } = build({}, { store });
    const res = await service.token({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      scope: 'req-scope'
    });
    expect(res.scope).toBe('req-scope');
    expect(store.saveAccessToken.mock.calls[0][0].scope).toBe('req-scope');
  });

  it('prefers the resolved client over the record client when a client is required', async () => {
    const store = makeStore();
    store.findRefreshToken.mockReturnValue(validRecord());
    const { service } = build({ requireClient: true }, { store, withClientStore: true });
    await service.token({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      client_id: 'c1'
    });
    const access = store.saveAccessToken.mock.calls[0][0];
    expect(access.client).toBe(CLIENT);
    expect(access.client).not.toBe(RECORD_CLIENT);
  });
});

describe('resolveClient (via grants)', () => {
  it('passes null as the client to validateUser when requireClient is false', async () => {
    const { service, validateUser, clientStore } = build();
    await service.token({ grant_type: 'password', username: 'a', password: 'b' });
    expect(validateUser).toHaveBeenCalledWith('a', 'b', null);
    expect(clientStore).toBeUndefined();
  });

  it('throws invalid_client when client_id is missing and a client is required', async () => {
    const { service } = build({ requireClient: true }, { withClientStore: true });
    const err = await grab(service.token({ grant_type: 'password', username: 'a', password: 'b' }));
    expect(err.error).toBe('invalid_client');
    expect(err.description).toBe('client_id is required');
  });

  it('throws invalid_client when no client store is configured', async () => {
    const { service } = build({ requireClient: true }, { clientStore: undefined });
    const err = await grab(
      service.token({ grant_type: 'password', username: 'a', password: 'b', client_id: 'c1' })
    );
    expect(err.error).toBe('invalid_client');
    expect(err.description).toBe('no client store configured');
  });

  it('throws invalid_client when the client is unknown', async () => {
    const clientStore = makeClientStore();
    clientStore.findClient.mockReturnValue(null);
    const { service } = build({ requireClient: true }, { clientStore });
    const err = await grab(
      service.token({ grant_type: 'password', username: 'a', password: 'b', client_id: 'c1' })
    );
    expect(err.error).toBe('invalid_client');
    expect(err.description).toBe('unknown client');
  });

  it('throws invalid_client when a confidential client secret fails verification', async () => {
    const clientStore = makeClientStore();
    clientStore.verifySecret.mockReturnValue(false);
    const { service } = build({ confidentialClients: true }, { clientStore });
    const err = await grab(
      service.token({
        grant_type: 'password',
        username: 'a',
        password: 'b',
        client_id: 'c1',
        client_secret: 'wrong'
      })
    );
    expect(err.error).toBe('invalid_client');
    expect(err.description).toBe('invalid client credentials');
  });

  it('proceeds when a confidential client secret verifies, passing the client to validateUser', async () => {
    const clientStore = makeClientStore();
    const { service, validateUser } = build({ confidentialClients: true }, { clientStore });
    await service.token({
      grant_type: 'password',
      username: 'a',
      password: 'b',
      client_id: 'c1',
      client_secret: 'right'
    });
    expect(clientStore.verifySecret).toHaveBeenCalledWith(CLIENT, 'right');
    expect(validateUser).toHaveBeenCalledWith('a', 'b', CLIENT);
  });

  it('does not consult verifySecret when clients are required but not confidential', async () => {
    const clientStore = makeClientStore();
    const { service, validateUser } = build({ requireClient: true }, { clientStore });
    await service.token({ grant_type: 'password', username: 'a', password: 'b', client_id: 'c1' });
    expect(clientStore.verifySecret).not.toHaveBeenCalled();
    expect(validateUser).toHaveBeenCalledWith('a', 'b', CLIENT);
  });
});

describe('revoke()', () => {
  it('throws invalid_request when token is missing', async () => {
    const { service } = build();
    const err = await grab(service.revoke({ token: '' }));
    expect(err.error).toBe('invalid_request');
    expect(err.description).toBe('token is required');
  });

  it("revokes only the refresh token for hint 'refresh_token'", async () => {
    const { service, store } = build();
    await service.revoke({ token: 't', token_type_hint: 'refresh_token' });
    expect(store.revokeRefreshToken).toHaveBeenCalledWith('t');
    expect(store.revokeAccessToken).not.toHaveBeenCalled();
  });

  it("revokes only the access token for hint 'access_token'", async () => {
    const { service, store } = build();
    await service.revoke({ token: 't', token_type_hint: 'access_token' });
    expect(store.revokeAccessToken).toHaveBeenCalledWith('t');
    expect(store.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes both tokens when no hint is given', async () => {
    const { service, store } = build();
    await service.revoke({ token: 't' });
    expect(store.revokeAccessToken).toHaveBeenCalledWith('t');
    expect(store.revokeRefreshToken).toHaveBeenCalledWith('t');
  });
});

describe('verifyAccessToken()', () => {
  it('returns null for an unknown token', async () => {
    const store = makeStore();
    store.findAccessToken.mockReturnValue(null);
    const { service } = build({}, { store });
    expect(await service.verifyAccessToken('t')).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const store = makeStore();
    store.findAccessToken.mockReturnValue({
      user: USER,
      client: CLIENT,
      expiryDate: new Date(NOW.getTime() - 1)
    } satisfies StoredAccessToken);
    const { service } = build({}, { store });
    expect(await service.verifyAccessToken('t')).toBeNull();
  });

  it('returns the record for a valid token', async () => {
    const record: StoredAccessToken = {
      user: USER,
      client: CLIENT,
      expiryDate: new Date(NOW.getTime() + 10_000)
    };
    const store = makeStore();
    store.findAccessToken.mockReturnValue(record);
    const { service } = build({}, { store });
    expect(await service.verifyAccessToken('t')).toBe(record);
  });
});
