import { timingSafeEqual } from 'node:crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export const ORIGIN_HEADER = 'x-blue-veil-origin';
const client = new SecretsManagerClient({ region: 'us-east-1', maxAttempts: 2 });
let cached: { until: number; secret: string } | undefined;

export async function awsOriginSecret(): Promise<string> {
  const arn = process.env.ORIGIN_SECRET_ARN;
  if (!arn || arn.endsWith(':unconfigured')) throw new Error('Origin is not configured');
  if (cached && cached.until > Date.now()) return cached.secret;
  const result = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const secret = result.SecretString ?? '';
  if (!/^[a-zA-Z0-9]{64}$/.test(secret)) throw new Error('Invalid origin secret');
  cached = { secret, until: Date.now() + 60_000 };
  return secret;
}

// Only CloudFront injects this token. Never log it or return it to a player.
// Reject before using the forwarded network header, cookies or any data store.
export async function trustedOrigin(
  headers: Record<string, string | undefined>,
  getSecret: () => Promise<string> = awsOriginSecret,
): Promise<boolean> {
  const token = headers[ORIGIN_HEADER];
  if (!token || !/^[a-zA-Z0-9]{64}$/.test(token)) return false;
  try {
    const expected = await getSecret();
    const a = Buffer.from(token),
      b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
