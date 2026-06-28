import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OAuth2PasswordService } from './oauth2-password.service';
import type { ResolvedOAuth2PasswordOptions } from './options';
import { IS_PUBLIC_KEY } from './public.decorator';
import { OAUTH2_PASSWORD_OPTIONS } from './tokens';

/**
 * Default-deny bearer guard. Extracts `Authorization: Bearer <opaque>`, looks it
 * up via {@link OAuth2PasswordService.verifyAccessToken} (a store read every
 * request — that's the price of instant revocation), and attaches the principal
 * to `request[attachTo]`. `@Public()` routes bypass entirely.
 */
@Injectable()
export class OAuth2PasswordGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(OAuth2PasswordService)
    private readonly service: OAuth2PasswordService,
    @Inject(OAUTH2_PASSWORD_OPTIONS)
    private readonly options: ResolvedOAuth2PasswordOptions
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.getToken(request);
    if (!token) throw new UnauthorizedException();

    const record = await this.service.verifyAccessToken(token);
    if (!record) throw new UnauthorizedException();

    request[this.options.attachTo] = record.user;
    request.client = record.client;
    return true;
  }

  private getToken(request: any): string | undefined {
    const header = request?.headers?.authorization;
    if (typeof header !== 'string') return undefined;
    return header.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
