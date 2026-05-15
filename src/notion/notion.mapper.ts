import { Goal } from '../goals/goals.service';

type NotionPage = Record<string, any>;

// Notion's native "status" type uses prop.status.name (not prop.select.name)
function statusValue(prop: any): string | undefined {
  const name = prop?.status?.name;
  if (!name) return undefined;
  // Normalize: "Not started" → "not_started", "In progress" → "in_progress", "Done" → "done"
  return name.toLowerCase().replace(/ /g, '_');
}

function selectValue(prop: any): string | undefined {
  return prop?.select?.name?.toLowerCase().replace(/ /g, '_');
}

function dateValue(prop: any): string | undefined {
  return prop?.date?.start ?? undefined;
}

function formulaNumber(prop: any): number {
  return prop?.formula?.number ?? 0;
}

function titleValue(prop: any): string {
  return prop?.title?.map((t: any) => t.plain_text).join('') ?? '';
}

export function mapPageToGoal(page: NotionPage): Goal {
  const props = page.properties;

  const statusRaw = statusValue(props['Status']) ?? 'not_started';
  const priorityRaw = selectValue(props['Priority']) ?? 'medium';

  return {
    id: page.id,
    notionPageId: page.id,
    title: titleValue(props['Project name']),
    status: statusRaw as Goal['status'],
    priority: priorityRaw as Goal['priority'],
    horizon: 'sprint', // not stored in this Notion DB
    dueDate: dateValue(props['End date']),
    progress: formulaNumber(props['Progress']),
  };
}

// Status is a Notion "status" type — values must match the DB options exactly
export function mapStatusToNotion(status: Goal['status']): string {
  const map: Record<Goal['status'], string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    blocked: 'In progress', // DB has no Blocked option
    done: 'Done',
  };
  return map[status];
}

export function mapPriorityToNotion(priority: Goal['priority']): string {
  const map: Record<Goal['priority'], string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  return map[priority];
}
