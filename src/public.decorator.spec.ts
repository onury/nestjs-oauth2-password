import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('Public', () => {
  it('exposes a stable metadata key', () => {
    expect(IS_PUBLIC_KEY).toBe('nestjs-oauth2-password:public');
  });

  it('sets the public metadata true on a handler', () => {
    class C {
      m() {}
    }
    const decorate = Public() as MethodDecorator;
    const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'm') as PropertyDescriptor;
    decorate(C.prototype, 'm', descriptor);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, C.prototype.m)).toBe(true);
  });
});
