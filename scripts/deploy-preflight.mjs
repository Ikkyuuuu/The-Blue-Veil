import 'dotenv/config';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';
import { stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const profile = process.env.AWS_PROFILE,
  expected = process.env.AWS_ACCOUNT_ID;
if ((process.env.AWS_REGION ?? 'ap-southeast-7') !== 'ap-southeast-7')
  throw new Error(
    'The current deployment is configured for the Thailand HTTP API. Review region-specific origins before changing regions.',
  );
if (!profile || profile === 'your-scoped-profile' || !expected || !/^\d{12}$/.test(expected))
  throw new Error(
    'Configure the scoped AWS_PROFILE and expected AWS_ACCOUNT_ID in the ignored .env file.',
  );
const identity = await new STSClient({
  region: process.env.AWS_REGION ?? 'ap-southeast-7',
  credentials: fromIni({ profile }),
}).send(new GetCallerIdentityCommand({}));
if (identity.Account !== expected) throw new Error('Account mismatch; deployment stopped.');
if (!identity.Arn?.includes(':assumed-role/'))
  throw new Error(
    'Use a scoped temporary assumed-role session for deployment. Root and permanent IAM-user credentials are refused.',
  );
for (const file of ['build/lambda/lambda.cjs', 'dist/index.html', 'public/assets/deck/back.png'])
  await stat(file);
const capacity = JSON.parse(
  execFileSync(
    'aws',
    [
      'lambda',
      'get-account-settings',
      '--profile',
      profile,
      '--region',
      'ap-southeast-7',
      '--output',
      'json',
      '--no-cli-pager',
    ],
    { encoding: 'utf8', windowsHide: true },
  ),
).AccountLimit;
// The game uses ten reserved slots; AWS also retains 100 unreserved slots.
if (capacity.ConcurrentExecutions < 110 || capacity.UnreservedConcurrentExecutions < 100)
  throw new Error(
    'The current account capacity cannot support the template reservations. Review concurrency settings before deploying.',
  );
console.info(
  'Expected account, temporary role and regional capacity verified. Local build and deck are present. No AWS resources have been changed.',
);
