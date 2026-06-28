import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { OAuth2PasswordService } from './oauth2-password.service';
import { Public } from './public.decorator';
import type { RevokeRequest, TokenRequest, TokenResponse } from './types';

/**
 * The built-in OAuth2 endpoints, mounted at `/oauth` unless you opt out with
 * `registerController: false` and wire your own. Both are `@Public()` — they
 * issue credentials, so the bearer guard must not gate them. Responses set
 * `Cache-Control: no-store` per RFC 6749 §5.1.
 *
 * If you use `nestjs-http-envelope`, mark these routes `@SkipEnvelope()` (or
 * provide your own controller) so the RFC token/error JSON isn't wrapped.
 */
@Public()
@Controller('oauth')
export class OAuth2PasswordController {
  constructor(private readonly service: OAuth2PasswordService) {}

  /** RFC 6749 §3.2 token endpoint — `password` and `refresh_token` grants. */
  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  token(@Body() body: TokenRequest): Promise<TokenResponse> {
    return this.service.token(body);
  }

  /** RFC 7009 token revocation — always 200, no body. */
  @Post('revoke')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  revoke(@Body() body: RevokeRequest): Promise<void> {
    return this.service.revoke(body);
  }
}
