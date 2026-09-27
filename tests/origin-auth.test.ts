import { describe, it, expect, vi } from 'vitest';
import { trustedOrigin, ORIGIN_HEADER } from '../server/origin-auth';
import { apiHandler, originAuthorizerHandler } from '../server/lambda';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

describe('CloudFront origin authentication', () => {
  const secret = 'a'.repeat(64);
  it('rejects absent, duplicate and malformed credentials before looking up the secret', async () => {
    const read = vi.fn(async () => secret);
    for (const token of [undefined, '', 'short', secret + ',' + secret, secret + '\n'])
      expect(await trustedOrigin({ [ORIGIN_HEADER]: token }, read)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
  it('accepts only the exact private token and fails closed on secret lookup failures', async () => {
    expect(await trustedOrigin({ [ORIGIN_HEADER]: secret }, async () => secret)).toBe(true);
    expect(await trustedOrigin({ [ORIGIN_HEADER]: 'b'.repeat(64) }, async () => secret)).toBe(
      false,
    );
    expect(
      await trustedOrigin({ [ORIGIN_HEADER]: secret }, async () => {
        throw new Error();
      }),
    ).toBe(false);
  });
  it('rejects a forged network header without constructing the game or accessing storage', async () => {
    const result = await apiHandler({
      headers: { 'x-blue-veil-network': '203.0.113.1' },
    } as unknown as APIGatewayProxyEventV2);
    expect(result.statusCode).toBe(403);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(await originAuthorizerHandler({})).toEqual({ isAuthorized: false });
  });
});
