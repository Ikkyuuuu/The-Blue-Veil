import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { validateNetworkSecret } from './network-quota.js';

// Persist beside the ignored local state, so restarting does not reset allowances.
export async function localNetworkSecret(file: string): Promise<string> {
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return validateNetworkSecret((await readFile(file, 'utf8')).trim());
}

const client = new SecretsManagerClient({});
let cached: Promise<string> | undefined;
export function awsNetworkSecret(): Promise<string> {
  const arn = process.env.NETWORK_SECRET_ARN;
  if (!arn) return Promise.reject(new Error('Missing network quota secret configuration'));
  // Rotation needs a coordinated rollout at the Bangkok day boundary;
  // replacing the key mid-day would reset IP quotas.
  return (cached ??= client
    .send(new GetSecretValueCommand({ SecretId: arn }))
    .then((result) => validateNetworkSecret(result.SecretString ?? ''))
    .catch(() => {
      cached = undefined;
      throw new Error('Network quota secret is unavailable');
    }));
}
