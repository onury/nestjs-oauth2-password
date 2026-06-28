import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OAuth2PasswordGuard } from './oauth2-password.guard';
import type { ResolvedOAuth2PasswordOptions } from './options';

class Ctrl {
  secured() {}
}

function ctx(request: unknown) {
  return {
    getHandler: () => Ctrl.prototype.secured,
    getClass: () => Ctrl,
    switchToHttp: () => ({ getRequest: () => request })
  } as never;
}

function makeGuard(opts: { isPublic?: boolean; record?: unknown; attachTo?: string }) {
  const reflector = { getAllAndOverride: vi.fn(() => opts.isPublic ?? false) };
  const service = { verifyAccessToken: vi.fn(async () => opts.record ?? null) };
  const options = { attachTo: opts.attachTo ?? 'user' } as ResolvedOAuth2PasswordOptions;
  const guard = new OAuth2PasswordGuard(reflector as never, service as never, options);
  return { guard, reflector, service };
}

const bearer = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });

describe('OAuth2PasswordGuard', () => {
  it('allows @Public() routes without touching the service', async () => {
    const { guard, reflector, service } = makeGuard({ isPublic: true });
    await expect(guard.canActivate(ctx(bearer('t')))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('nestjs-oauth2-password:public', [
      Ctrl.prototype.secured,
      Ctrl
    ]);
    expect(service.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects when there is no Authorization header', async () => {
    const { guard, service } = makeGuard({});
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(service.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects when the header is not a string', async () => {
    const { guard } = makeGuard({});
    await expect(
      guard.canActivate(ctx({ headers: { authorization: ['Bearer x'] } }))
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed header without the Bearer prefix (even if the token would verify)', async () => {
    // A valid record is returned by the service, so the only thing that can
    // reject here is the missing `Bearer ` prefix — this pins the prefix check.
    const { guard, service } = makeGuard({ record: { user: {}, client: {} } });
    await expect(
      guard.canActivate(ctx({ headers: { authorization: 'Basic abcdefghij' } }))
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects when there is no request object at all', async () => {
    const { guard } = makeGuard({});
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects (without throwing) when the request has no headers object', async () => {
    // Pins the optional chaining on `headers`: a present request with no
    // `headers` must yield an UnauthorizedException, not a TypeError.
    const { guard } = makeGuard({});
    await expect(guard.canActivate(ctx({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the access token does not verify', async () => {
    const { guard, service } = makeGuard({ record: null });
    await expect(guard.canActivate(ctx(bearer('tok')))).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(service.verifyAccessToken).toHaveBeenCalledWith('tok');
  });

  it('attaches the principal and client on a valid token', async () => {
    const record = { user: { id: 'u1' }, client: { id: 'c1' } };
    const { guard, service } = makeGuard({ record });
    const req: Record<string, unknown> = bearer('tok');
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(service.verifyAccessToken).toHaveBeenCalledWith('tok');
    expect(req.user).toBe(record.user);
    expect(req.client).toBe(record.client);
  });

  it('attaches the principal to a custom attachTo property', async () => {
    const record = { user: { id: 'u1' }, client: { id: 'c1' } };
    const { guard } = makeGuard({ record, attachTo: 'principal' });
    const req: Record<string, unknown> = bearer('tok');
    await guard.canActivate(ctx(req));
    expect(req.principal).toBe(record.user);
    expect(req.user).toBeUndefined();
    expect(req.client).toBe(record.client);
  });
});
