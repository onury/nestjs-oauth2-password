import { SetMetadata } from '@nestjs/common';

/** Metadata key set by {@link Public}; read by {@link OAuth2PasswordGuard}. */
export const IS_PUBLIC_KEY = 'nestjs-oauth2-password:public';

/**
 * Exempt a route (or whole controller) from the bearer guard — no access token
 * required. The token and revoke endpoints are public by construction.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
