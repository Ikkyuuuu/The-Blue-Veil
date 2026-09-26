import type { APIGatewayProxyEventV2, DynamoDBStreamEvent, SQSEvent } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoStore } from './store.js';
import { Game, DEFAULT_SETTINGS } from './game.js';
import { api } from './http.js';
import { BedrockGenerator } from './generator.js';
import { cleanup, processReading } from './worker.js';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required setting: ${name}`);
  return value;
};
const integer = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid setting: ${name}`);
  return value;
};
let instance: Game | undefined;
function game() {
  return (instance ??= new Game(
    new DynamoStore(required('STATE_TABLE'), required('CONTENT_TABLE')),
    {
      ...DEFAULT_SETTINGS,
      mode: 'bedrock',
      generationEnabled: process.env.GENERATION_ENABLED === 'true',
      dailyLimit: integer('DAILY_READING_LIMIT', 100),
      monthlyLimit: integer('MONTHLY_READING_LIMIT', 2000),
      aiBudgetMicros: integer('AI_BUDGET_MICROS', 2_000_000),
    },
  ));
}
const sqs = new SQSClient({});
const send = (id: string) =>
  sqs.send(
    new SendMessageCommand({
      QueueUrl: required('JOB_QUEUE_URL'),
      MessageBody: JSON.stringify({ id }),
    }),
  );
export async function apiHandler(event: APIGatewayProxyEventV2) {
  const headers = { ...event.headers, cookie: event.cookies?.join('; ') ?? event.headers.cookie };
  const body = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '');
  const result = await api(game(), [required('APP_ORIGIN')])({
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers,
    body,
    secure: true,
  });
  return {
    statusCode: result.status,
    headers: result.headers,
    body: result.body,
    ...(result.cookie ? { cookies: [result.cookie] } : {}),
  };
}
export async function dispatcherHandler(event: DynamoDBStreamEvent) {
  for (const record of event.Records) {
    const image = record.dynamodb?.NewImage;
    if (image?.work?.S === 'OUTBOX' && image.pk?.S?.startsWith('outbox#'))
      await send(image.pk.S.slice(7));
  }
}
export async function workerHandler(event: SQSEvent) {
  const generator = new BedrockGenerator({
    region: required('BEDROCK_REGION'),
    model: required('BEDROCK_INFERENCE_PROFILE_ID'),
    guardrailId: required('BEDROCK_GUARDRAIL_ID'),
    guardrailVersion: required('BEDROCK_GUARDRAIL_VERSION'),
  });
  const failures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    let id: string;
    try {
      const body = JSON.parse(record.body) as { id?: unknown };
      if (typeof body.id !== 'string' || !/^[a-f0-9]{32}$/.test(body.id))
        throw new Error('Invalid job');
      id = body.id;
    } catch {
      console.warn(JSON.stringify({ event: 'invalid_job' }));
      continue;
    }
    try {
      await processReading(game(), generator, id);
    } catch {
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
export async function reconcileHandler() {
  for (const key of await game().store.due('OUTBOX', Date.now(), 50)) await send(key.slice(7));
  await cleanup(game());
}
