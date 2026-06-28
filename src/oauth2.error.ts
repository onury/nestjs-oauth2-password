import { HttpException, HttpStatus } from '@nestjs/common';

/** RFC 6749 §5.2 / §4.4.x error codes used by the token & revoke endpoints. */
export type OAuth2ErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope';

/** Default HTTP status per error code. `invalid_client` is the only 401. */
const STATUS_BY_CODE: Record<OAuth2ErrorCode, HttpStatus> = {
  invalid_request: HttpStatus.BAD_REQUEST,
  invalid_client: HttpStatus.UNAUTHORIZED,
  invalid_grant: HttpStatus.BAD_REQUEST,
  unauthorized_client: HttpStatus.BAD_REQUEST,
  unsupported_grant_type: HttpStatus.BAD_REQUEST,
  invalid_scope: HttpStatus.BAD_REQUEST
};

/**
 * An OAuth2 protocol error. Its response body is the RFC 6749 §5.2 shape
 * — `{ error, error_description? }` — not the app's generic envelope, so mark
 * the token endpoint `@SkipEnvelope()` if you use `nestjs-http-envelope`.
 */
export class OAuth2Exception extends HttpException {
  constructor(
    readonly error: OAuth2ErrorCode,
    readonly description?: string,
    status: HttpStatus = STATUS_BY_CODE[error]
  ) {
    super(description ? { error, error_description: description } : { error }, status);
  }
}
