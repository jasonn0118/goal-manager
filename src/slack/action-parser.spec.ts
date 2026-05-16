import { extractFirstJson, parseActions } from './action-parser';

describe('extractFirstJson', () => {
  it('returns json and end index for a simple object', () => {
    const result = extractFirstJson('{"type":"update_goal"}');
    expect(result).not.toBeNull();
    expect(result!.json).toEqual({ type: 'update_goal' });
    expect(result!.end).toBe(22);
  });

  it('returns null for an empty string', () => {
    expect(extractFirstJson('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(extractFirstJson('{bad json}')).toBeNull();
  });

  it('end points past the closing brace so the caller can slice from there', () => {
    const str = '{"a":1} trailing text';
    const result = extractFirstJson(str);
    expect(result!.end).toBe(7);
    expect(str.slice(result!.end)).toBe(' trailing text');
  });

  it('counts braces correctly for nested objects', () => {
    const str = '{"outer":{"inner":"value"}}';
    const result = extractFirstJson(str);
    expect(result!.json).toEqual({ outer: { inner: 'value' } });
    expect(result!.end).toBe(str.length);
  });

  it('stops at the first complete JSON object when multiple appear in sequence', () => {
    const str = '{"a":1}{"b":2}';
    const result = extractFirstJson(str);
    expect(result!.json).toEqual({ a: 1 });
    expect(result!.end).toBe(7);
  });

  it('returns null when string has only an opening brace', () => {
    expect(extractFirstJson('{')).toBeNull();
  });
});

describe('parseActions', () => {
  it('returns original text and empty actions when no ACTION block exists', () => {
    const { cleanText, actions } = parseActions('Just a normal message.');
    expect(cleanText).toBe('Just a normal message.');
    expect(actions).toEqual([]);
  });

  it('strips a single ACTION block and returns its parsed JSON', () => {
    const response = 'Done!\nACTION:{"type":"update_goal","goalId":"g1"}';
    const { cleanText, actions } = parseActions(response);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'update_goal', goalId: 'g1' });
    expect(cleanText).not.toContain('ACTION:');
    expect(cleanText).toContain('Done!');
  });

  it('extracts two ACTION blocks in order', () => {
    const response = [
      'Updated two goals.',
      'ACTION:{"type":"update_goal","goalId":"g1","fields":{"status":"done"}}',
      '---',
      'ACTION:{"type":"update_goal","goalId":"g2","fields":{"status":"in_progress"}}',
    ].join('\n');
    const { cleanText, actions } = parseActions(response);
    expect(actions).toHaveLength(2);
    expect(actions[0].goalId).toBe('g1');
    expect(actions[1].goalId).toBe('g2');
    expect(cleanText).not.toContain('ACTION:');
  });

  it('handles whitespace between ACTION: and {', () => {
    const response = 'Done.\nACTION:  {"type":"create_goal"}';
    const { actions } = parseActions(response);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('create_goal');
  });

  it('removes --- separator lines from cleanText', () => {
    const response = 'Great work!\n---\nACTION:{"type":"delete_goal","goalId":"g1"}';
    const { cleanText } = parseActions(response);
    expect(cleanText).not.toContain('---');
    expect(cleanText).toContain('Great work!');
  });

  it('stops and returns partial results when invalid JSON follows ACTION:', () => {
    const response = [
      'Done.',
      'ACTION:{"type":"update_goal","goalId":"g1"}',
      'ACTION:{not valid json}',
    ].join('\n');
    const { actions } = parseActions(response);
    expect(actions).toHaveLength(1);
    expect(actions[0].goalId).toBe('g1');
  });

  it('cleanText does not contain leftover ACTION: markers after successful extraction', () => {
    const response = 'Here you go.\nACTION:{"type":"create_goal","fields":{"title":"New"}}';
    const { cleanText } = parseActions(response);
    expect(cleanText).not.toMatch(/ACTION:/);
  });
});
