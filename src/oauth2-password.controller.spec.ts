import { describe, expect, it, vi } from 'vitest';
import { OAuth2PasswordController } from './oauth2-password.controller';
import type { OAuth2PasswordService } from './oauth2-password.service';
import type { RevokeRequest, TokenRequest, TokenResponse } from './types';

describe('OAuth2PasswordController', () => {
  it('delegates token() to the service and returns its result', async () => {
    const response: TokenResponse = {
      access_token: 'at',
      token_type: 'Bearer',
      expires_in: 3600
    };
    const service = {
      token: vi.fn(async () => response),
      revoke: vi.fn()
    } as unknown as OAuth2PasswordService;
    const controller = new OAuth2PasswordController(service);
    const body: TokenRequest = { grant_type: 'password', username: 'a', password: 'b' };

    await expect(controller.token(body)).resolves.toBe(response);
    expect(service.token).toHaveBeenCalledWith(body);
  });

  it('delegates revoke() to the service with the exact body', async () => {
    const service = {
      token: vi.fn(),
      revoke: vi.fn(async () => undefined)
    } as unknown as OAuth2PasswordService;
    const controller = new OAuth2PasswordController(service);
    const body: RevokeRequest = { token: 't', token_type_hint: 'access_token' };

    await expect(controller.revoke(body)).resolves.toBeUndefined();
    expect(service.revoke).toHaveBeenCalledWith(body);
  });
});
