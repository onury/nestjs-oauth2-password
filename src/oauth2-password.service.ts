import { Inject, Injectable } from '@nestjs/common';
import { OAuth2Exception } from './oauth2.error';
import type { ResolvedOAuth2PasswordOptions } from './options';
import { expiresAt, generateToken, isExpired } from './token.util';
import { OAUTH2_PASSWORD_OPTIONS } from './tokens';
import type { RevokeRequest, StoredAccessToken, TokenRequest, TokenResponse } from './types';

/**
 * The ROPC grant engine — fully framework-internal logic, no HTTP coupling, so
 * it's testable in isolation and reusable if you wire your own controller.
 * Dispatches `password` and `refresh_token` grants, mints opaque tokens, rotates
 * refresh tokens on use, and authenticates bearer tokens for the guard.
 */
@Injectable()
export class OAuth2PasswordService<TUser = unknown, TClient = unknown> {
  constructor(
    @Inject(OAUTH2_PASSWORD_OPTIONS)
    private readonly options: ResolvedOAuth2PasswordOptions<TUser, TClient>
  ) {}

  /** Token endpoint (RFC 6749 §3.2): dispatch by `grant_type`. */
  async token(body: TokenRequest): Promise<TokenResponse> {
    switch (body.grant_type) {
      case 'password':
        return this.passwordGrant(body);
      case 'refresh_token':
        return this.refreshGrant(body);
      default:
        throw new OAuth2Exception(
          'unsupported_grant_type',
          `grant_type '${body.grant_type}' is not supported`
        );
    }
  }

  /** Revocation endpoint (RFC 7009): best-effort, always succeeds. */
  async revoke(body: RevokeRequest): Promise<void> {
    if (!body.token) {
      throw new OAuth2Exception('invalid_request', 'token is required');
    }
    const { tokenStore } = this.options;
    if (body.token_type_hint === 'refresh_token') {
      await tokenStore.revokeRefreshToken(body.token);
      return;
    }
    if (body.token_type_hint === 'access_token') {
      await tokenStore.revokeAccessToken(body.token);
      return;
    }
    await tokenStore.revokeAccessToken(body.token);
    await tokenStore.revokeRefreshToken(body.token);
  }

  /** Authenticate a bearer access token for the guard. `null` ⇒ reject. */
  async verifyAccessToken(token: string): Promise<StoredAccessToken<TUser, TClient> | null> {
    const record = await this.options.tokenStore.findAccessToken(token);
    if (!record || isExpired(record.expiresAt)) return null;
    return record;
  }

  private async passwordGrant(body: TokenRequest): Promise<TokenResponse> {
    const client = await this.resolveClient(body.client_id, body.client_secret);
    if (!body.username || !body.password) {
      throw new OAuth2Exception('invalid_request', 'username and password are required');
    }
    const user = await this.options.validateUser(body.username, body.password, client);
    if (!user) {
      throw new OAuth2Exception('invalid_grant', 'invalid username or password');
    }
    return this.issueTokens(user, client, body.scope);
  }

  private async refreshGrant(body: TokenRequest): Promise<TokenResponse> {
    const client = await this.resolveClient(body.client_id, body.client_secret);
    if (!body.refresh_token) {
      throw new OAuth2Exception('invalid_request', 'refresh_token is required');
    }
    const record = await this.options.tokenStore.findRefreshToken(body.refresh_token);
    if (!record || isExpired(record.expiresAt)) {
      throw new OAuth2Exception('invalid_grant', 'invalid or expired refresh token');
    }
    // Rotate: revoke the presented refresh token and the access token it was
    // paired with, then mint a fresh pair for the same principal.
    await this.options.tokenStore.revokeAccessToken(record.accessToken);
    await this.options.tokenStore.revokeRefreshToken(body.refresh_token);
    return this.issueTokens(record.user, client ?? record.client, body.scope ?? record.scope);
  }

  private async issueTokens(
    user: TUser,
    client: TClient | null,
    scope: string | undefined
  ): Promise<TokenResponse> {
    const o = this.options;
    const accessToken = generateToken(o.tokenBytes);
    await o.tokenStore.saveAccessToken({
      token: accessToken,
      user,
      client,
      scope,
      expiresAt: expiresAt(o.accessTokenTtl)
    });
    const response: TokenResponse = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: o.accessTokenTtl
    };
    if (scope) response.scope = scope;
    if (o.enableRefreshToken) {
      const refreshToken = generateToken(o.tokenBytes);
      await o.tokenStore.saveRefreshToken({
        token: refreshToken,
        accessToken,
        user,
        client,
        scope,
        expiresAt: expiresAt(o.refreshTokenTtl)
      });
      response.refresh_token = refreshToken;
    }
    return response;
  }

  private async resolveClient(
    clientId: string | undefined,
    clientSecret: string | undefined
  ): Promise<TClient | null> {
    const o = this.options;
    if (!o.requireClient) return null;
    if (!clientId) {
      throw new OAuth2Exception('invalid_client', 'client_id is required');
    }
    if (!o.clientStore) {
      throw new OAuth2Exception('invalid_client', 'no client store configured');
    }
    const client = await o.clientStore.findClient(clientId);
    if (!client) {
      throw new OAuth2Exception('invalid_client', 'unknown client');
    }
    if (o.confidentialClients) {
      const ok = await o.clientStore.verifySecret(client, clientSecret);
      if (!ok) {
        throw new OAuth2Exception('invalid_client', 'invalid client credentials');
      }
    }
    return client;
  }
}
