import 'dotenv/config';
import { createApp } from './stacks.js';
const account = process.env.AWS_ACCOUNT_ID || undefined;
if (account && !/^\d{12}$/.test(account))
  throw new Error('Invalid expected AWS account configuration.');
createApp(account, process.env.AWS_REGION ?? 'ap-southeast-7', {
  assetBucketPrefix: process.env.DEPLOY_ASSET_BUCKET_PREFIX,
  workloadBoundaryArn: process.env.WORKLOAD_BOUNDARY_ARN,
}).synth();
