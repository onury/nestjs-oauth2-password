import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { type OAuth2ErrorCode, OAuth2Exception } from './oauth2.error';

describe('OAuth2Exception', () => {
  it.each<[OAuth2ErrorCode, number]>([
    ['invalid_request', HttpStatus.BAD_REQUEST],
    ['invalid_client', HttpStatus.UNAUTHORIZED],
    ['invalid_grant', HttpStatus.BAD_REQUEST],
    ['unauthorized_client', HttpStatus.BAD_REQUEST],
    ['unsupported_grant_type', HttpStatus.BAD_REQUEST],
    ['invalid_scope', HttpStatus.BAD_REQUEST]
  ])('maps %s → status %i', (code, status) => {
    expect(new OAuth2Exception(code).getStatus()).toBe(status);
  });

  it('is the only 401 for invalid_client; all others are 400', () => {
    expect(new OAuth2Exception('invalid_client').getStatus()).toBe(401);
    for (const code of [
      'invalid_request',
      'invalid_grant',
      'unauthorized_client',
      'unsupported_grant_type',
      'invalid_scope'
    ] as OAuth2ErrorCode[]) {
      expect(new OAuth2Exception(code).getStatus()).toBe(400);
    }
  });

  it('body is { error } when no description is given', () => {
    const exc = new OAuth2Exception('invalid_grant');
    expect(exc.getResponse()).toEqual({ error: 'invalid_grant' });
  });

  it('body is { error, error_description } when a description is given', () => {
    const exc = new OAuth2Exception('invalid_grant', 'bad credentials');
    expect(exc.getResponse()).toEqual({
      error: 'invalid_grant',
      error_description: 'bad credentials'
    });
  });

  it('honors an explicit status override', () => {
    const exc = new OAuth2Exception('invalid_request', 'x', HttpStatus.I_AM_A_TEAPOT);
    expect(exc.getStatus()).toBe(HttpStatus.I_AM_A_TEAPOT);
  });

  it('exposes error and description as readable properties', () => {
    const exc = new OAuth2Exception('invalid_scope', 'unknown scope');
    expect(exc.error).toBe('invalid_scope');
    expect(exc.description).toBe('unknown scope');
  });

  it('leaves description undefined when omitted', () => {
    expect(new OAuth2Exception('invalid_request').description).toBeUndefined();
  });
});
