import type { DynamicModule, Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OAuth2PasswordController } from './oauth2-password.controller';
import { OAuth2PasswordGuard } from './oauth2-password.guard';
import { OAuth2PasswordService } from './oauth2-password.service';
import {
  type OAuth2PasswordAsyncOptions,
  type OAuth2PasswordBehavior,
  type OAuth2PasswordOptions,
  resolveOptions
} from './options';
import { OAUTH2_PASSWORD_OPTIONS } from './tokens';

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module idiom — forRoot/forRootAsync are conventionally static factories on the module class.
export class OAuth2PasswordModule {
  /** Synchronous registration: pass the seams and behavior directly. */
  static forRoot<TUser = unknown, TClient = unknown>(
    options: OAuth2PasswordOptions<TUser, TClient>
  ): DynamicModule {
    const optionsProvider: Provider = {
      provide: OAUTH2_PASSWORD_OPTIONS,
      useValue: resolveOptions(options)
    };
    return OAuth2PasswordModule.build(options, optionsProvider, []);
  }

  /** Asynchronous registration: build the seams from injected deps. */
  static forRootAsync<TUser = unknown, TClient = unknown>(
    options: OAuth2PasswordAsyncOptions<TUser, TClient>
  ): DynamicModule {
    const optionsProvider: Provider = {
      provide: OAUTH2_PASSWORD_OPTIONS,
      inject: options.inject ?? [],
      useFactory: async (...args: any[]) =>
        resolveOptions({ ...options, ...(await options.useFactory(...args)) })
    };
    return OAuth2PasswordModule.build(options, optionsProvider, options.imports ?? []);
  }

  private static build(
    behavior: OAuth2PasswordBehavior,
    optionsProvider: Provider,
    imports: NonNullable<DynamicModule['imports']>
  ): DynamicModule {
    const providers: Provider[] = [optionsProvider, OAuth2PasswordService, OAuth2PasswordGuard];
    if (behavior.registerGuard ?? true) {
      providers.push({ provide: APP_GUARD, useExisting: OAuth2PasswordGuard });
    }
    const controllers = (behavior.registerController ?? true) ? [OAuth2PasswordController] : [];
    return {
      module: OAuth2PasswordModule,
      global: behavior.isGlobal ?? true,
      imports,
      controllers,
      providers,
      exports: [OAuth2PasswordService, OAuth2PasswordGuard, OAUTH2_PASSWORD_OPTIONS]
    };
  }
}
