# nestjs-oauth2-password

<p align="center">
  <a href="https://github.com/onury/nestjs-oauth2-password/actions/workflows/ci.yml"><img src="https://github.com/onury/nestjs-oauth2-password/actions/workflows/ci.yml/badge.svg" alt="build" /></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-100%25-2BB150?logo=vitest&logoColor=%23FDC72B&style=flat" alt="coverage" /></a>
  <a href="https://stryker-mutator.io/"><img src="https://img.shields.io/badge/mutation-100%25-2BB150?style=flat" alt="mutation score" /></a>
  <a href="https://www.npmjs.com/package/nestjs-oauth2-password"><img src="https://img.shields.io/npm/v/nestjs-oauth2-password.svg?style=flat&label=&color=%23C6234B&logo=npm" alt="version" /></a>
  <a href="https://img.shields.io/badge/deps-zero-2BB150"><img src="https://img.shields.io/badge/deps-zero-2BB150?style=flat" alt="zero dependencies" /></a>
  <a href="https://gist.github.com/onury/d3f3d765d7db2e8b2d050d14315f2ac7"><img src="https://img.shields.io/badge/ESM-F7DF1E?style=flat" alt="ESM" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TS-3260C7?style=flat" alt="TypeScript" /></a>
  <a href="https://github.com/onury/nestjs-oauth2-password/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="license" /></a>
</p>

OAuth2 Resource Owner Password Credentials (ROPC) for [NestJS](https://nestjs.com): **opaque, server-stored, revocable** access + refresh tokens, an [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) token endpoint with [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009) revocation, and a default-deny bearer guard — wired with a single `forRoot()`.

> 🔆 **[ESM](https://gist.github.com/onury/d3f3d765d7db2e8b2d050d14315f2ac7)-only.** Requires Node ≥ 20 and NestJS 10 / 11.
>
> This is the **opaque-token** half. It owns the OAuth2 *flow* and delegates the credential check to the token-agnostic companion (`nestjs-credentials`) and token storage to your database. For stateless self-contained JWTs instead, use the sibling `nestjs-jwt-guard`.

## Why

Unlike a self-contained JWT, an opaque token carries no claims — it's just a high-entropy string looked up on every request. That one store read per request is the price of what JWTs can't do: **instant revocation** and always-live user state. This package mints the tokens and runs the grant flow; **you** own persistence (so revocation is real) and the credential check (so there are no user-model opinions).

> ROPC hands the user's password straight to the client, so it's justified for **first-party** apps (your own web/mobile client) or legacy interop — not third-party delegation. What's valuable here is the opaque + revocable + refresh + client-id machinery, not the grant itself.

## Install

```bash
npm install nestjs-oauth2-password nestjs-credentials
```

`@nestjs/common`, `@nestjs/core`, and `reflect-metadata` are peer dependencies (already in any Nest app). `nestjs-credentials` is optional but recommended — it's the natural `validateUser` seam.

## Quick start

Register once. It mounts `POST /oauth/token` + `POST /oauth/revoke` and registers the bearer guard globally:

```ts
import { Module } from '@nestjs/common';
import { CredentialsModule, CredentialsService } from 'nestjs-credentials';
import { OAuth2PasswordModule } from 'nestjs-oauth2-password';
import { TokenStoreService } from './token-store.service';

@Module({
  imports: [
    CredentialsModule.register({ useFactory: () => userStore }), // user lookup + password verify
    OAuth2PasswordModule.forRootAsync({
      inject: [CredentialsService, TokenStoreService],
      useFactory: (creds: CredentialsService, tokens: TokenStoreService) => ({
        validateUser: (username, password) => creds.verify(username, password),
        tokenStore: tokens,
        accessTokenTtl: 60 * 60,           // 1h
        refreshTokenTtl: 60 * 60 * 24 * 14, // 14d
      }),
    }),
  ],
})
export class AppModule {}
```

**Get a token** — the `password` grant:

```http
POST /oauth/token
Content-Type: application/json

{ "grant_type": "password", "username": "ada@example.com", "password": "secret" }
```

```json
{ "access_token": "v4y…", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "8Qb…" }
```

**Refresh** it — the old access + refresh tokens are revoked and a fresh pair is issued (rotation):

```http
POST /oauth/token
{ "grant_type": "refresh_token", "refresh_token": "8Qb…" }
```

**Call a protected route** with `Authorization: Bearer <access_token>`. Every route requires a valid token; mark exceptions with `@Public()`:

```ts
import { Public, type AuthenticatedRequest } from 'nestjs-oauth2-password';

@Public()
@Get('health')
health() { return { ok: true }; }

@Get('me')
me(@Req() req: AuthenticatedRequest) {
  return req.user; // whatever your validateUser returned; req.client too
}
```

**Revoke** a token (logout) — [RFC 7009](https://www.rfc-editor.org/rfc/rfc7009), always `200`:

```http
POST /oauth/revoke
{ "token": "8Qb…", "token_type_hint": "refresh_token" }
```

> Using [`nestjs-http-envelope`](https://github.com/onury/nestjs-http-envelope)? Mark the OAuth2 routes `@SkipEnvelope()` (or set `registerController: false` and mount your own) so the RFC token/error JSON isn't wrapped.

## The seams

The package is stateless — you supply three seams. Only the first two are required.

| Seam | Shape | Role |
| --- | --- | --- |
| `validateUser` | `(username, password, client) => user \| null` | The ROPC credential check. Wire it to `nestjs-credentials` (`creds.verify`). Return `null` ⇒ `invalid_grant`. |
| `tokenStore` | `save` / `find` / `revoke` × `access` / `refresh` | Opaque-token persistence. Back it with Prisma/TypeORM/Redis. |
| `clientStore` | `findClient`, `verifySecret` | Client identity & secret — required only when `requireClient`/`confidentialClients` is on. |

A minimal `TokenStore` (the package mints the token and computes `expiryDate`; you persist it — hash at rest with the provided `hashToken`):

```ts
import { Injectable } from '@nestjs/common';
import {
  hashToken,
  type IssuedAccessToken,
  type StoredAccessToken,
  type TokenStore,
} from 'nestjs-oauth2-password';

@Injectable()
export class TokenStoreService implements TokenStore<User> {
  constructor(private readonly db: PrismaService) {}

  saveAccessToken(t: IssuedAccessToken<User>) {
    return this.db.accessToken.create({
      data: { tokenHash: hashToken(t.token), userId: t.user.id, expiryDate: t.expiryDate },
    });
  }

  async findAccessToken(token: string): Promise<StoredAccessToken<User> | null> {
    const row = await this.db.accessToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    return row ? { user: row.user, client: null, expiryDate: row.expiryDate } : null;
  }

  revokeAccessToken(token: string) {
    return this.db.accessToken.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  // …saveRefreshToken / findRefreshToken / revokeRefreshToken follow the same shape.
  // A refresh row stores the access token it was issued with, so rotation revokes both.
}
```

## Grants

The token endpoint dispatches on `grant_type`:

| `grant_type` | Body fields | Result |
| --- | --- | --- |
| `password` | `username`, `password` (+ `client_id`/`client_secret` if required) | A new access token (+ refresh token unless disabled). |
| `refresh_token` | `refresh_token` (+ `client_id`/`client_secret` if required) | Revokes the presented pair, issues a fresh one. |

Protocol errors use the RFC 6749 §5.2 shape — `{ "error": "invalid_grant", "error_description": "…" }` — via `OAuth2Exception` (`invalid_client` ⇒ `401`, the rest ⇒ `400`).

## Configuration

```ts
OAuth2PasswordModule.forRoot({
  validateUser: (username, password, client) => credentials.verify(username, password), // required
  tokenStore,                  // required
  clientStore,                 // required if requireClient/confidentialClients
  accessTokenTtl: 3600,        // seconds (default)
  refreshTokenTtl: 1209600,    // seconds (default — 14d)
  enableRefreshToken: true,    // issue refresh tokens (default)
  requireClient: false,        // require client_id on every grant (default)
  confidentialClients: false,  // verify client_secret — implies requireClient (default)
  tokenBytes: 32,              // entropy of generated opaque tokens (default — 256-bit)
  attachTo: 'user',            // request property the principal is attached to (default)
  registerGuard: true,         // register the bearer guard globally via APP_GUARD (default)
  registerController: true,    // mount /oauth/token + /oauth/revoke (default)
  isGlobal: true,              // module is global (default)
});
```

| Option | Default | Description |
| --- | --- | --- |
| `validateUser` | — | The ROPC credential check (required). |
| `tokenStore` | — | Opaque-token persistence (required). |
| `clientStore` | — | Client lookup/auth — required if `requireClient`/`confidentialClients`. |
| `accessTokenTtl` | `3600` | Access-token lifetime, seconds. |
| `refreshTokenTtl` | `1209600` | Refresh-token lifetime, seconds. |
| `enableRefreshToken` | `true` | Issue refresh tokens alongside access tokens. |
| `requireClient` | `false` | Require a `client_id` on every grant. |
| `confidentialClients` | `false` | Verify `client_secret` (implies `requireClient`). |
| `tokenBytes` | `32` | Entropy (bytes) of generated opaque tokens. |
| `attachTo` | `'user'` | Request property the principal is attached to. |
| `registerGuard` | `true` | Register the bearer guard globally via `APP_GUARD`. |
| `registerController` | `true` | Mount the built-in token & revoke controller. |
| `isGlobal` | `true` | Register the module globally. |

## Per-route use

Disable the global guard (`registerGuard: false`) and apply per-controller instead — the guard is exported:

```ts
@UseGuards(OAuth2PasswordGuard)
@Controller('admin')
export class AdminController {}
```

## API

**Module**

| Export | Description |
| --- | --- |
| `OAuth2PasswordModule.forRoot(options)` | Configure the seams + behavior synchronously. See [Configuration](#configuration). |
| `OAuth2PasswordModule.forRootAsync(options)` | Build the seams from injected deps (`useFactory`). |

**Flow & enforcement**

| Export | Description |
| --- | --- |
| `OAuth2PasswordController` | The `/oauth/token` + `/oauth/revoke` endpoints. Opt out with `registerController: false`. |
| `OAuth2PasswordGuard` | The bearer guard. Registered globally by default; exported for per-route `@UseGuards`. |
| `OAuth2PasswordService` | `token(body)`, `revoke(body)`, `verifyAccessToken(token)` — the grant engine, if you wire your own controller. |
| `@Public()` | Marks a route/controller as exempt from the guard. |
| `IS_PUBLIC_KEY` | The metadata key `@Public()` sets (for custom reflection). |

**Helpers & advanced**

| Export | Description |
| --- | --- |
| `generateToken(bytes?)` | Mint a high-entropy opaque token (default 256-bit). |
| `hashToken(token)` | SHA-256 hex digest — hash tokens at rest in your store. |
| `expiryDate(ttlSeconds, now?)` · `isExpired(date, now?)` | TTL/expiry helpers. |
| `OAuth2Exception` | RFC 6749 §5.2 protocol error (`OAuth2ErrorCode`). |
| `OAUTH2_PASSWORD_OPTIONS` | DI token holding the resolved options. |
| `resolveOptions(options)` | Merge options over the defaults → `ResolvedOAuth2PasswordOptions`. |

**Types**

| Export | Description |
| --- | --- |
| `ValidateUser`, `ClientStore`, `TokenStore` | The three seams. |
| `IssuedAccessToken`, `IssuedRefreshToken`, `StoredAccessToken`, `StoredRefreshToken` | Token records handed to / returned from the store. |
| `TokenRequest`, `TokenResponse`, `RevokeRequest`, `AuthenticatedRequest` | HTTP contract types. |
| `OAuth2PasswordOptions`, `OAuth2PasswordAsyncOptions`, `OAuth2PasswordBehavior`, `OAuth2PasswordProviders`, `ResolvedOAuth2PasswordOptions` | Option types. |

## Related Projects

- [**nestjs-credentials**](https://github.com/onury/nestjs-credentials) — Token-agnostic username/password verification: a `UserStore` seam + pluggable `PasswordHasher`. The natural `validateUser` companion.
- [**nestjs-jwt-guard**](https://github.com/onury/nestjs-jwt-guard) — The stateless, self-contained-JWT alternative: a configurable bearer guard, `@Public()`, and a token-issuance helper.
- [**nestjs-accesscontrol**](https://github.com/onury/nestjs-accesscontrol) — The official NestJS integration for [AccessControl v3](https://github.com/onury/accesscontrol): RBAC + ABAC with fluent CRUD decorators and attribute filtering.
- [**nestjs-http-envelope**](https://github.com/onury/nestjs-http-envelope) — A uniform, configurable response & error envelope for NestJS.
- [**nestjs-configuard**](https://github.com/onury/nestjs-configuard) — The NestJS integration for [configuard](https://github.com/onury/configuard): DB-backed, typed, ABAC-filtered runtime config.

## License

[MIT](./LICENSE) © Onur Yıldırım
