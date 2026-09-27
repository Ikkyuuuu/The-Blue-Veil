import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export const NETWORK_HEADER = 'x-blue-veil-network';
export type NetworkQuota = (day: string) => string;

// Exact IPv4, or an IPv6 /64 so temporary interface addresses share a quota.
// Never trust a request body, Forwarded or X-Forwarded-For as this input.
export function networkAddress(address?: string): string {
  if (!address || address.includes('%')) throw new Error('Missing or invalid network address');
  const family = isIP(address);
  if (family === 4) return `v4:${address}`;
  if (family !== 6) throw new Error('Missing or invalid network address');
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const parts = normalized.split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const words = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right].map(
    (word) => Number.parseInt(word, 16),
  );
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff)
    return `v4:${[words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join('.')}`;
  return `v6:${words
    .slice(0, 4)
    .map((word) => word.toString(16).padStart(4, '0'))
    .join(':')}/64`;
}

export function validateNetworkSecret(secret: string): string {
  if (!/^[a-zA-Z0-9]{64}$/.test(secret)) throw new Error('Invalid network quota secret');
  return secret;
}

export function networkQuota(secret: string, address?: string): NetworkQuota {
  validateNetworkSecret(secret);
  const network = networkAddress(address);
  return (day) => {
    const digest = createHmac('sha256', secret)
      .update(`blue-veil:network:v1:${day}:${network}`)
      .digest('hex');
    return `network-quota#${day}#${digest}`;
  };
}
