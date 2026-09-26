import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Game, type Reading } from '../server/game';
import { MemoryStore } from '../server/store';
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-bedrock-runtime', async (original) => {
  const actual = await original<typeof import('@aws-sdk/client-bedrock-runtime')>();
  return {
    ...actual,
    BedrockRuntimeClient: class {
      send = send;
    },
  };
});
import { BedrockGenerator, LocalGenerator } from '../server/generator';
const config = {
  region: 'us-east-1',
  model: 'us.amazon.nova-micro-v1:0',
  guardrailId: 'test-guardrail',
  guardrailVersion: '1',
};
async function fixture() {
  const game = new Game(new MemoryStore());
  const { session } = await game.session();
  const { id } = await game.submit(session, {
    question: 'How can I approach change?',
    requestId: randomUUID(),
  });
  return (await game.store.get<Reading>(`reading#${id}`))!;
}
beforeEach(() => send.mockReset());
it('refuses an unversioned guardrail', () => {
  expect(() => new BedrockGenerator({ ...config, guardrailVersion: 'DRAFT' })).toThrow();
});
it('does not invoke the model after blocked input', async () => {
  send.mockResolvedValueOnce({ action: 'GUARDRAIL_INTERVENED' });
  const answer = await new BedrockGenerator(config).generate(
    'How can I approach change?',
    await fixture(),
  );
  expect(answer.synthesis).toContain('qualified professional');
  expect(send).toHaveBeenCalledTimes(1);
});
it('fails closed if moderation has no explicit verdict', async () => {
  send.mockResolvedValueOnce({});
  await expect(
    new BedrockGenerator(config).generate('How can I approach change?', await fixture()),
  ).rejects.toMatchObject({ code: 'MODERATION_UNAVAILABLE' });
  expect(send).toHaveBeenCalledTimes(1);
});
it('checks generated output and replaces blocked content', async () => {
  const reading = await fixture();
  const output = await new LocalGenerator().generate('How can I approach change?', reading);
  send.mockResolvedValueOnce({ action: 'NONE' });
  send.mockResolvedValueOnce({
    output: { message: { content: [{ text: JSON.stringify(output) }] } },
    stopReason: 'end_turn',
  });
  send.mockResolvedValueOnce({ action: 'GUARDRAIL_INTERVENED' });
  const answer = await new BedrockGenerator(config).generate('How can I approach change?', reading);
  expect(send).toHaveBeenCalledTimes(3);
  expect(answer.synthesis).not.toBe(output.synthesis);
  expect(send.mock.calls[2][0].input.source).toBe('OUTPUT');
});
