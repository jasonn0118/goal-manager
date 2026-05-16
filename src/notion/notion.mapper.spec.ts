import { mapPageToGoal, mapStatusToNotion, mapPriorityToNotion } from './notion.mapper';

function makePage(propertyOverrides: Record<string, any> = {}) {
  return {
    id: 'page-123',
    properties: {
      'Project name': { title: [{ plain_text: 'Test Goal' }] },
      Status: { status: { name: 'In progress' } },
      Priority: { select: { name: 'High' } },
      'Start date': { date: { start: '2024-01-01' } },
      'End date': { date: { start: '2024-12-31' } },
      'Start value': { number: 0 },
      'End value': { number: 100 },
      Progress: { rollup: { number: 0.5 } },
      Description: { rich_text: [{ plain_text: 'A description' }] },
      ...propertyOverrides,
    },
  };
}

describe('mapPageToGoal', () => {
  it('maps all standard properties from a Notion page', () => {
    const goal = mapPageToGoal(makePage());
    expect(goal.id).toBe('page-123');
    expect(goal.notionPageId).toBe('page-123');
    expect(goal.title).toBe('Test Goal');
    expect(goal.status).toBe('in_progress');
    expect(goal.priority).toBe('high');
    expect(goal.startDate).toBe('2024-01-01');
    expect(goal.endDate).toBe('2024-12-31');
    expect(goal.startValue).toBe(0);
    expect(goal.endValue).toBe(100);
    expect(goal.progress).toBe(0.5);
    expect(goal.description).toBe('A description');
    expect(goal.horizon).toBe('sprint');
  });

  it('defaults status to not_started when property is missing', () => {
    const goal = mapPageToGoal(makePage({ Status: {} }));
    expect(goal.status).toBe('not_started');
  });

  it('defaults priority to medium when property is missing', () => {
    const goal = mapPageToGoal(makePage({ Priority: {} }));
    expect(goal.priority).toBe('medium');
  });

  it.each([
    ['Not started', 'not_started'],
    ['In progress', 'in_progress'],
    ['Done', 'done'],
  ])('normalizes Notion status "%s" to "%s"', (notionName, expected) => {
    const goal = mapPageToGoal(makePage({ Status: { status: { name: notionName } } }));
    expect(goal.status).toBe(expected);
  });

  it('reads progress from formula when rollup is absent', () => {
    const goal = mapPageToGoal(makePage({ Progress: { formula: { number: 0.75 } } }));
    expect(goal.progress).toBe(0.75);
  });

  it('returns 0 progress when property is missing entirely', () => {
    const goal = mapPageToGoal(makePage({ Progress: {} }));
    expect(goal.progress).toBe(0);
  });

  it('returns undefined description when rich_text array is empty', () => {
    const goal = mapPageToGoal(makePage({ Description: { rich_text: [] } }));
    expect(goal.description).toBeUndefined();
  });

  it('concatenates multiple rich_text chunks into one description string', () => {
    const goal = mapPageToGoal(
      makePage({
        Description: { rich_text: [{ plain_text: 'Hello ' }, { plain_text: 'world' }] },
      }),
    );
    expect(goal.description).toBe('Hello world');
  });

  it('returns undefined startDate and endDate when absent', () => {
    const goal = mapPageToGoal(makePage({ 'Start date': {}, 'End date': {} }));
    expect(goal.startDate).toBeUndefined();
    expect(goal.endDate).toBeUndefined();
  });
});

describe('mapStatusToNotion', () => {
  it('maps not_started to "Not started"', () => {
    expect(mapStatusToNotion('not_started')).toBe('Not started');
  });

  it('maps in_progress to "In progress"', () => {
    expect(mapStatusToNotion('in_progress')).toBe('In progress');
  });

  it('maps blocked to "In progress" (no Blocked option in DB)', () => {
    expect(mapStatusToNotion('blocked')).toBe('In progress');
  });

  it('maps done to "Done"', () => {
    expect(mapStatusToNotion('done')).toBe('Done');
  });
});

describe('mapPriorityToNotion', () => {
  it.each([
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
  ] as const)('maps "%s" to "%s"', (input, expected) => {
    expect(mapPriorityToNotion(input)).toBe(expected);
  });
});
