import { describe, expect, it } from 'vitest';
import { groupTurns } from './CompareView';
import type { ChatMessage } from '../types/trial';

const m = (id: string, role: ChatMessage['role']): ChatMessage => ({
  id, participantId: 'p', role, messageType: role === 'assistant' ? 'MODEL_RESPONSE' : 'USER_PROMPT',
  content: id, timestamp: '',
});

describe('groupTurns', () => {
  it('pairs each prompt with the replies after it and ignores system setup', () => {
    const t = groupTurns([m('s', 'system'), m('u1', 'user'), m('a1', 'assistant'), m('u2', 'user'), m('a2', 'assistant'), m('a3', 'assistant')]);
    expect(t).toHaveLength(2);
    expect(t[0].prompt?.id).toBe('u1');
    expect(t[1].responses.map((r) => r.id)).toEqual(['a2', 'a3']);
  });
  it('keeps a reply that has no prompt', () => {
    const t = groupTurns([m('a1', 'assistant')]);
    expect(t).toHaveLength(1);
    expect(t[0].prompt).toBeUndefined();
  });
});
