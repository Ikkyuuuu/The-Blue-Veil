import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

export type Row = {
  pk: string;
  rev: string;
  value: unknown;
  expiresAt: number;
  work?: string;
  due?: number;
};
export class Conflict extends Error {}
export class Transaction {
  readonly changes = new Map<string, Row | null>();
  constructor(readonly rows: Map<string, Row | undefined>) {}
  get<T>(key: string): T | undefined {
    return (this.changes.has(key) ? this.changes.get(key)?.value : this.rows.get(key)?.value) as
      T | undefined;
  }
  put(key: string, value: unknown, expiresAt: number, work?: string, due?: number) {
    if (!this.rows.has(key)) throw new Error('Undeclared transaction key');
    this.changes.set(key, {
      pk: key,
      rev: randomUUID(),
      value,
      expiresAt: Math.floor(expiresAt / 1000),
      ...(work ? { work, due: due ?? expiresAt } : {}),
    });
  }
  delete(key: string) {
    if (!this.rows.has(key)) throw new Error('Undeclared transaction key');
    this.changes.set(key, null);
  }
}
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  transact<T>(keys: string[], operation: (tx: Transaction) => T): Promise<T>;
  due(work: string, now: number, limit?: number): Promise<string[]>;
}
export class MemoryStore implements Store {
  private rows = new Map<string, Row>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private file?: string) {}
  async load() {
    if (this.file) {
      try {
        this.rows = new Map(JSON.parse(await readFile(this.file, 'utf8')));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  async get<T>(key: string): Promise<T | undefined> {
    await this.tail;
    return structuredClone(this.rows.get(key)?.value as T | undefined);
  }
  async transact<T>(keys: string[], operation: (tx: Transaction) => T): Promise<T> {
    const job = this.tail.then(async () => {
      const tx = new Transaction(
        new Map([...new Set(keys)].map((key) => [key, structuredClone(this.rows.get(key))])),
      );
      const result = operation(tx);
      const next = new Map(this.rows);
      for (const [key, row] of tx.changes) row ? next.set(key, row) : next.delete(key);
      if (this.file) {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(`${this.file}.tmp`, JSON.stringify([...next]));
        await rename(`${this.file}.tmp`, this.file);
      }
      this.rows = next;
      return structuredClone(result);
    });
    this.tail = job.catch(() => undefined);
    return job;
  }
  async due(work: string, now: number, limit = 50) {
    await this.tail;
    return [...this.rows.values()]
      .filter((row) => row.work === work && (row.due ?? Infinity) <= now)
      .slice(0, limit)
      .map((row) => row.pk);
  }
}
export class DynamoStore implements Store {
  private client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  constructor(
    private stateTable: string,
    private contentTable: string,
  ) {}
  private table(key: string) {
    return key.startsWith('content#') ? this.contentTable : this.stateTable;
  }
  private async row(key: string): Promise<Row | undefined> {
    return (
      await this.client.send(
        new GetCommand({ TableName: this.table(key), Key: { pk: key }, ConsistentRead: true }),
      )
    ).Item as Row | undefined;
  }
  async get<T>(key: string) {
    return (await this.row(key))?.value as T | undefined;
  }
  async transact<T>(keys: string[], operation: (tx: Transaction) => T): Promise<T> {
    const unique = [...new Set(keys)];
    for (let attempt = 0; attempt < 8; attempt++) {
      const rows = await Promise.all(
        unique.map(async (key) => [key, await this.row(key)] as const),
      );
      const tx = new Transaction(new Map(rows));
      const result = operation(tx);
      if (!tx.changes.size) return result;
      const items = unique.map((key) => {
        const before = tx.rows.get(key);
        const condition = {
          TableName: this.table(key),
          ConditionExpression: before ? '#rev = :rev' : 'attribute_not_exists(pk)',
          ...(before
            ? {
                ExpressionAttributeNames: { '#rev': 'rev' },
                ExpressionAttributeValues: { ':rev': before.rev },
              }
            : {}),
        };
        if (tx.changes.has(key)) {
          const after = tx.changes.get(key);
          return after
            ? { Put: { ...condition, Item: after } }
            : { Delete: { ...condition, Key: { pk: key } } };
        }
        return { ConditionCheck: { ...condition, Key: { pk: key } } };
      });
      try {
        await this.client.send(
          new TransactWriteCommand({ TransactItems: items, ClientRequestToken: randomUUID() }),
        );
        return result;
      } catch (error) {
        const e = error as { name: string; CancellationReasons?: { Code?: string }[] };
        const retryable =
          e.name === 'TransactionConflictException' ||
          (e.name === 'TransactionCanceledException' &&
            e.CancellationReasons?.some((x) =>
              ['ConditionalCheckFailed', 'TransactionConflict'].includes(x.Code ?? ''),
            ));
        if (!retryable || attempt === 7) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 10 * (attempt + 1) + Math.random() * 30),
        );
      }
    }
    throw new Conflict('Please retry');
  }
  async due(work: string, now: number, limit = 50) {
    const table = work === 'CONTENT' ? this.contentTable : this.stateTable;
    const result = await this.client.send(
      new QueryCommand({
        TableName: table,
        IndexName: 'work-due',
        KeyConditionExpression: '#work = :work AND due <= :now',
        ExpressionAttributeNames: { '#work': 'work' },
        ExpressionAttributeValues: { ':work': work, ':now': now },
        Limit: limit,
        ProjectionExpression: 'pk',
      }),
    );
    return (result.Items ?? []).map((row) => row.pk as string);
  }
}
