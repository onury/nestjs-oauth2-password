import { APP_GUARD } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { OAuth2PasswordController } from './oauth2-password.controller';
import { OAuth2PasswordGuard } from './oauth2-password.guard';
import { OAuth2PasswordModule } from './oauth2-password.module';
import { OAuth2PasswordService } from './oauth2-password.service';
import { OAUTH2_PASSWORD_OPTIONS } from './tokens';
import type { TokenStore, ValidateUser } from './types';

function providerFor(mod: { providers?: any[] }, token: unknown): any {
  return (mod.providers ?? []).find((p) => p?.provide === token);
}

const validateUser: ValidateUser = vi.fn();
const tokenStore = {} as TokenStore;
const baseOptions = { validateUser, tokenStore };

describe('OAuth2PasswordModule.forRoot', () => {
  it('wires the module, options, service, guard, global guard, and controller', () => {
    const mod = OAuth2PasswordModule.forRoot(baseOptions);
    expect(mod.module).toBe(OAuth2PasswordModule);
    expect(mod.global).toBe(true);
    expect(mod.imports).toEqual([]);
    expect(mod.providers).toContain(OAuth2PasswordService);
    expect(mod.providers).toContain(OAuth2PasswordGuard);
    expect(mod.controllers).toEqual([OAuth2PasswordController]);
    expect(mod.exports).toEqual([
      OAuth2PasswordService,
      OAuth2PasswordGuard,
      OAUTH2_PASSWORD_OPTIONS
    ]);

    const optionsProvider = providerFor(mod, OAUTH2_PASSWORD_OPTIONS);
    expect(optionsProvider.useValue.validateUser).toBe(validateUser);
    expect(optionsProvider.useValue.accessTokenTtl).toBe(3600);

    expect(providerFor(mod, APP_GUARD).useExisting).toBe(OAuth2PasswordGuard);
  });

  it('registers the global guard when registerGuard is omitted or true', () => {
    expect(providerFor(OAuth2PasswordModule.forRoot(baseOptions), APP_GUARD)).toBeDefined();
    expect(
      providerFor(OAuth2PasswordModule.forRoot({ ...baseOptions, registerGuard: true }), APP_GUARD)
    ).toBeDefined();
  });

  it('omits the global guard when registerGuard is false', () => {
    const mod = OAuth2PasswordModule.forRoot({ ...baseOptions, registerGuard: false });
    expect(providerFor(mod, APP_GUARD)).toBeUndefined();
  });

  it('omits the controller when registerController is false', () => {
    const mod = OAuth2PasswordModule.forRoot({ ...baseOptions, registerController: false });
    expect(mod.controllers).toEqual([]);
  });

  it('mounts the controller when registerController is true', () => {
    const mod = OAuth2PasswordModule.forRoot({ ...baseOptions, registerController: true });
    expect(mod.controllers).toEqual([OAuth2PasswordController]);
  });

  it('honors isGlobal: false', () => {
    expect(OAuth2PasswordModule.forRoot({ ...baseOptions, isGlobal: false }).global).toBe(false);
  });

  it('honors isGlobal: true', () => {
    expect(OAuth2PasswordModule.forRoot({ ...baseOptions, isGlobal: true }).global).toBe(true);
  });
});

describe('OAuth2PasswordModule.forRootAsync', () => {
  it('defaults imports and inject to [] and resolves options from the factory', async () => {
    const useFactory = vi.fn(() => baseOptions);
    const mod = OAuth2PasswordModule.forRootAsync({ accessTokenTtl: 99, useFactory });

    expect(mod.global).toBe(true);
    expect(mod.imports).toEqual([]);
    expect(mod.controllers).toEqual([OAuth2PasswordController]);
    expect(providerFor(mod, APP_GUARD).useExisting).toBe(OAuth2PasswordGuard);

    const optionsProvider = providerFor(mod, OAUTH2_PASSWORD_OPTIONS);
    expect(optionsProvider.inject).toEqual([]);

    const resolved = await optionsProvider.useFactory();
    expect(useFactory).toHaveBeenCalledWith();
    // Merges behavior from `options` with providers from the factory result.
    expect(resolved.accessTokenTtl).toBe(99);
    expect(resolved.validateUser).toBe(validateUser);
    expect(resolved.tokenStore).toBe(tokenStore);
  });

  it('passes imports and inject through and forwards injected deps to the factory', async () => {
    class Imp {}
    const DEP = Symbol('DEP');
    const useFactory = vi.fn((_dep: unknown) => baseOptions);
    const mod = OAuth2PasswordModule.forRootAsync({
      imports: [Imp],
      inject: [DEP],
      useFactory
    });

    expect(mod.imports).toEqual([Imp]);
    const optionsProvider = providerFor(mod, OAUTH2_PASSWORD_OPTIONS);
    expect(optionsProvider.inject).toEqual([DEP]);

    const dep = { the: 'dep' };
    await optionsProvider.useFactory(dep);
    expect(useFactory).toHaveBeenCalledWith(dep);
  });

  it('awaits an async factory result', async () => {
    const useFactory = vi.fn(async () => baseOptions);
    const mod = OAuth2PasswordModule.forRootAsync({ useFactory });
    const resolved = await providerFor(mod, OAUTH2_PASSWORD_OPTIONS).useFactory();
    expect(resolved.validateUser).toBe(validateUser);
  });

  it('omits the global guard when registerGuard is false', () => {
    const mod = OAuth2PasswordModule.forRootAsync({
      useFactory: () => baseOptions,
      registerGuard: false
    });
    expect(providerFor(mod, APP_GUARD)).toBeUndefined();
  });

  it('omits the controller when registerController is false', () => {
    const mod = OAuth2PasswordModule.forRootAsync({
      useFactory: () => baseOptions,
      registerController: false
    });
    expect(mod.controllers).toEqual([]);
  });

  it('honors isGlobal: false', () => {
    const mod = OAuth2PasswordModule.forRootAsync({
      useFactory: () => baseOptions,
      isGlobal: false
    });
    expect(mod.global).toBe(false);
  });
});
