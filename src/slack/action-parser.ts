export function extractFirstJson(str: string): { json: any; end: number } | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') { if (start === -1) start = i; depth++; }
    else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return { json: JSON.parse(str.slice(start, i + 1)), end: i + 1 }; } catch { return null; }
      }
    }
  }
  return null;
}

export function parseActions(response: string): { cleanText: string; actions: any[] } {
  const marker = 'ACTION:';
  const actions: any[] = [];
  let text = response;

  while (text.includes(marker)) {
    const idx = text.indexOf(marker);
    const afterMarker = text.slice(idx + marker.length);
    const trimmedAfter = afterMarker.trimStart();
    const result = extractFirstJson(trimmedAfter);
    if (!result) break;

    const leadingSpaces = afterMarker.length - trimmedAfter.length;
    const jsonEnd = idx + marker.length + leadingSpaces + result.end;

    text = (text.slice(0, idx) + text.slice(jsonEnd)).replace(/\n?---\n?/g, '\n').trim();
    actions.push(result.json);
  }

  return { cleanText: text, actions };
}
