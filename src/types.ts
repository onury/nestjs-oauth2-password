/**
 * The three seams a host application supplies. The package owns the OAuth2
 * Resource Owner Password Credentials (ROPC) *flow* — grant dispatch, opaque
 * token generation, rotation, the bearer guard — and delegates everything
 * stateful (credential checks, client lookup, token persistence) to these.
 *
 * Tokens are **opaque and server-stored**: the package mints a high-entropy
 * string and hands it to your {@link TokenStore}; the store decides how to
 * persist it (hash it, set a TTL row, etc.). Nothing is self-contained, so a
 * token can be revoked instantly.
 */

/** A request after {@link OAuth2PasswordGuard} has attached the principal. */
export interface AuthenticatedRequest<TUser = unknown, TClient = unknown> {
  user?: TUser;
  client?: TClient | null;
  [key: string]: unknown;
}

/**
 * Validates a username/password (the ROPC credential check). Return the user on
 * success, `null` to reject (⇒ `invalid_grant`). This is the seam you wire to
 * `nestjs-credentials` — typically `(u, p) => credentialsService.verify(u, p)`.
 * The resolved `client` is passed through for client-scoped user lookups.
 */
export type ValidateUser<TUser = unknown, TClient = unknown> = (
  username: string,
  password: string,
  client: TClient | null
) => Promise<TUser | null> | TUser | null;

/**
 * Resolves and authenticates the OAuth2 client. Only consulted when
 * `requireClient`/`confidentialClients` is on. `verifySecret` receives the
 * presented `client_secret` (possibly `undefined`) and decides if it matches.
 */
export interface ClientStore<TClient = unknown> {
  /** Look up a client by its `client_id`. Return `null` ⇒ `invalid_client`. */
  findClient(clientId: string): Promise<TClient | null> | TClient | null;
  /** Verify a confidential client's secret. Return `false` ⇒ `invalid_client`. */
  verifySecret(client: TClient, clientSecret: string | undefined): Promise<boolean> | boolean;
}

/** An access token the package has minted, handed to the store to persist. */
export interface IssuedAccessToken<TUser = unknown, TClient = unknown> {
  token: string;
  user: TUser;
  client: TClient | null;
  scope?: string;
  expiryDate: Date;
}

/**
 * A refresh token the package has minted. `accessToken` links it 1:1 to the
 * access token it can refresh, mirroring the reference design's row linkage.
 */
export interface IssuedRefreshToken<TUser = unknown, TClient = unknown> {
  token: string;
  accessToken: string;
  user: TUser;
  client: TClient | null;
  scope?: string;
  expiryDate: Date;
}

/** A persisted access token returned from a lookup. */
export interface StoredAccessToken<TUser = unknown, TClient = unknown> {
  user: TUser;
  client: TClient | null;
  scope?: string;
  expiryDate: Date;
}

/**
 * A persisted refresh token returned from a lookup. `accessToken` is the access
 * token it was issued with, so rotation can revoke that access token too.
 */
export interface StoredRefreshToken<TUser = unknown, TClient = unknown> {
  user: TUser;
  client: TClient | null;
  scope?: string;
  expiryDate: Date;
  accessToken: string;
}

/**
 * The token persistence seam. The package never stores anything itself; you
 * back this with Prisma/TypeORM/Redis/etc. Lookups return `null` for unknown
 * tokens; the package additionally treats an `expiryDate` in the past as expired
 * (defense in depth — you may also filter expired rows at the query).
 */
export interface TokenStore<TUser = unknown, TClient = unknown> {
  saveAccessToken(token: IssuedAccessToken<TUser, TClient>): Promise<void> | void;
  saveRefreshToken(token: IssuedRefreshToken<TUser, TClient>): Promise<void> | void;
  findAccessToken(
    token: string
  ): Promise<StoredAccessToken<TUser, TClient> | null> | StoredAccessToken<TUser, TClient> | null;
  findRefreshToken(
    token: string
  ): Promise<StoredRefreshToken<TUser, TClient> | null> | StoredRefreshToken<TUser, TClient> | null;
  revokeAccessToken(token: string): Promise<void> | void;
  revokeRefreshToken(token: string): Promise<void> | void;
}

/** RFC 6749 §5.1 token response (snake_case, `expires_in` in seconds). */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/** RFC 6749 §4.3.2 / §6 token-endpoint request body (form-encoded). */
export interface TokenRequest {
  grant_type: string;
  username?: string;
  password?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
}

/** RFC 7009 §2.1 revocation request body. */
export interface RevokeRequest {
  token: string;
  token_type_hint?: 'access_token' | 'refresh_token';
}
