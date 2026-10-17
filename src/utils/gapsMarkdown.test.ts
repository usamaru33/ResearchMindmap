import { describe, expect, it } from 'vitest';
import { gapsToMarkdown } from './gapsMarkdown';

describe('gapsToMarkdown', () => {
  it('renders gaps with evidence and questions', () => {
    const md = gapsToMarkdown(
      [{ title: 'Children', description: 'Only adults tested.', evidence: [{ paperId: 'a', quote: 'adults only' }], paperIds: ['a'], questions: ['Does it hold for children?'] }],
      (id) => (id === 'a' ? 'Paper A' : id),
    );
    expect(md).toBe('### Children\n\nOnly adults tested.\n\n- 「adults only」 — Paper A\n\n**研究課題の案**\n- Does it hold for children?');
  });
});
