export type CoreOperation = 'beamform' | 'filter' | 'flow' | 'displacement';
export const operationFunctions: Record<CoreOperation, string[]> = {
  beamform: ['buildDasPlan', 'applyDasPlan'],
  filter: ['filterTemporalSubspace'],
  flow: ['lagOneDoppler'],
  displacement: ['trackAxialNcc'],
};
/** Excerpts are taken from the shipped source, never a separately maintained pseudocode copy. */
export function findCoreExcerpt(sources: Record<string, string>, name: string) {
  const expression = new RegExp(`^export (?:async )?function ${name}\\s*\\(`, 'm');
  for (const [path, source] of Object.entries(sources)) {
    const match = expression.exec(source);
    if (!match) continue;
    const start = match.index;
    const next = source.indexOf('\nexport ', start + match[0].length);
    return { name, path: path.replace('../', 'src/'), line: source.slice(0, start).split('\n').length,
      code: source.slice(start, next === -1 ? source.length : next).trim() };
  }
  return undefined;
}
