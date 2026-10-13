export function withoutScenarioDetails<T extends { url: string }>(event: T): T {
  const url = new URL(event.url);
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}
