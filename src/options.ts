import type { ModuleMetadata } from '@nestjs/common';
import type { ClientStore, TokenStore, ValidateUser } from './types';

/** Tunables shared by `forRoot` and `forRootAsync` — all optional, all defaulted. */
export interface OAuth2PasswordBehavior {
  /** Access-token lifetime in seconds. Default: `3600` (1h). */
  accessTokenTtl?: number;
  /** Refresh-token lifetime in seconds. Default: `1209600` (14d). */
  refreshTokenTtl?: number;
  /** Issue refresh tokens alongside access tokens. Default: `true`. */
  enableRefreshToken?: boolean;
  /** Require a `client_id` on every grant. Default: `false` (public client). */
  requireClient?: boolean;
  /** Verify `client_secret` via the client store. Implies `requireClient`. Default: `false`. */
  confidentialClients?: boolean;
  /** Entropy (bytes) for generated opaque tokens. Default: `32` (256-bit). */
  tokenBytes?: number;
  /** Request property the principal is attached to by the guard. Default: `'user'`. */
  attachTo?: string;
  /** Register the bearer guard globally via `APP_GUARD`. Default: `true`. */
  registerGuard?: boolean;
  /** Mount the built-in token & revoke controller. Default: `true`. */
  registerController?: boolean;
  /** Register the module globally. Default: `true`. */
  isGlobal?: boolean;
}

/** The three seams a host must supply. */
export interface OAuth2PasswordProviders<TUser = unknown, TClient = unknown> {
  /** The ROPC credential check — wire to `nestjs-credentials`. */
  validateUser: ValidateUser<TUser, TClient>;
  /** Opaque-token persistence. */
  tokenStore: TokenStore<TUser, TClient>;
  /** Client resolution/auth — required when `requireClient`/`confidentialClients` is on. */
  clientStore?: ClientStore<TClient>;
}

/** Synchronous registration: pass the seams and behavior directly. */
export interface OAuth2PasswordOptions<TUser = unknown, TClient = unknown>
  extends OAuth2PasswordProviders<TUser, TClient>,
    OAuth2PasswordBehavior {}

/** Asynchronous registration: build the seams from injected deps. */
export interface OAuth2PasswordAsyncOptions<TUser = unknown, TClient = unknown>
  extends OAuth2PasswordBehavior {
  imports?: ModuleMetadata['imports'];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => OAuth2PasswordProviders<TUser, TClient> | Promise<OAuth2PasswordProviders<TUser, TClient>>;
}

/** Fully-populated config consumed by the service and guard. */
export interface ResolvedOAuth2PasswordOptions<TUser = unknown, TClient = unknown>
  extends OAuth2PasswordProviders<TUser, TClient> {
  accessTokenTtl: number;
  refreshTokenTtl: number;
  enableRefreshToken: boolean;
  requireClient: boolean;
  confidentialClients: boolean;
  tokenBytes: number;
  attachTo: string;
}

const DEFAULTS = {
  accessTokenTtl: 3600,
  refreshTokenTtl: 1209600,
  enableRefreshToken: true,
  tokenBytes: 32,
  attachTo: 'user'
} as const;

/**
 * Merge providers + behavior over the defaults. `confidentialClients` implies
 * `requireClient` (you can't verify a secret for a client you don't require).
 */
export function resolveOptions<TUser = unknown, TClient = unknown>(
  options: OAuth2PasswordProviders<TUser, TClient> & OAuth2PasswordBehavior
): ResolvedOAuth2PasswordOptions<TUser, TClient> {
  const confidentialClients = options.confidentialClients ?? false;
  return {
    validateUser: options.validateUser,
    tokenStore: options.tokenStore,
    clientStore: options.clientStore,
    accessTokenTtl: options.accessTokenTtl ?? DEFAULTS.accessTokenTtl,
    refreshTokenTtl: options.refreshTokenTtl ?? DEFAULTS.refreshTokenTtl,
    enableRefreshToken: options.enableRefreshToken ?? DEFAULTS.enableRefreshToken,
    requireClient: (options.requireClient ?? false) || confidentialClients,
    confidentialClients,
    tokenBytes: options.tokenBytes ?? DEFAULTS.tokenBytes,
    attachTo: options.attachTo ?? DEFAULTS.attachTo
  };
}
