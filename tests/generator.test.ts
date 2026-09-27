import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Game, type Reading } from '../server/game';
import { MemoryStore } from '../server/store';
import { CARDS, CARD_MAP } from '../shared/cards';
import { CARD_AURAS } from '../src/card-focus';
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
it('interprets every card in either orientation and supplies a matching aura', async () => {
  const reading = await fixture();
  const generator = new LocalGenerator();
  for (const reversed of [false, true]) {
    for (let index = 0; index < CARDS.length; index += 3) {
      const cards = CARDS.slice(index, index + 3);
      const answer = await generator.generate('What can I reflect on?', {
        ...reading,
        cards: cards.map((card) => ({ id: card.id, reversed })),
      });
      cards.forEach((card, i) => {
        expect(answer.cards[i].cardId).toBe(card.id);
        expect(answer.cards[i].interpretation).toContain(reversed ? card.reversed : card.upright);
        expect(card.reversed).not.toEqual(card.upright);
        expect(CARD_AURAS[card.id]?.primary).toMatch(/^\d+ \d+ \d+$/);
        expect(CARD_AURAS[card.id]?.secondary).toMatch(/^\d+ \d+ \d+$/);
      });
    }
  }
});
it('sends the selected minor meanings and orientations to Bedrock', async () => {
  const reading = await fixture();
  reading.cards = [
    { id: 'five-of-wands', reversed: false },
    { id: 'queen-of-cups', reversed: true },
    { id: 'king-of-pentacles', reversed: false },
  ];
  const output = await new LocalGenerator().generate('How can I approach change?', reading);
  send.mockResolvedValueOnce({ action: 'NONE' });
  send.mockResolvedValueOnce({
    output: { message: { content: [{ text: JSON.stringify(output) }] } },
    stopReason: 'end_turn',
  });
  send.mockResolvedValueOnce({ action: 'NONE' });
  expect(
    await new BedrockGenerator(config).generate('How can I approach change?', reading),
  ).toEqual(output);
  const context = JSON.parse(send.mock.calls[1][0].input.messages[0].content[0].text);
  expect(context.cards).toHaveLength(3);
  reading.cards.forEach(({ id, reversed }, i) => {
    const card = CARD_MAP.get(id)!;
    expect(context.cards[i]).toMatchObject({
      id,
      name: card.name,
      orientation: reversed ? 'reversed' : 'upright',
      meaning: reversed ? card.reversed : card.upright,
    });
  });
});
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
