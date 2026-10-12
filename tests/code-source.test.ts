import { expect, it } from 'vitest';
import { findCoreExcerpt } from '../src/demo/codeSource';
import { operationFunctions } from '../src/demo/codeSource';
import { readFileSync, readdirSync } from 'node:fs';
it('links an actual function excerpt to its source line without maintaining a second implementation', () => {
  const source = '// comment\nexport function applyDasPlan(plan: unknown) {\n  return plan;\n}\n\nexport function other() {}';
  expect(findCoreExcerpt({ '../core/flow/beamforming.ts': source }, 'applyDasPlan')).toEqual({
    name: 'applyDasPlan', path: 'src/core/flow/beamforming.ts', line: 2,
    code: 'export function applyDasPlan(plan: unknown) {\n  return plan;\n}',
  });
  expect(findCoreExcerpt({ '../core/flow/beamforming.ts': source }, 'missing')).toBeUndefined();
});
it('provides every displayed operation from the actual shared-core exports', () => {
  const sources = Object.fromEntries(readdirSync('src/core/flow').filter(name => name.endsWith('.ts')).map(name =>
    [`../core/flow/${name}`, readFileSync(`src/core/flow/${name}`, 'utf8')]));
  for (const name of Object.values(operationFunctions).flat()) {
    const excerpt = findCoreExcerpt(sources, name);
    expect(excerpt?.code.startsWith(`export function ${name}(`)).toBe(true);
    expect(excerpt!.line).toBeGreaterThan(0);
    expect(excerpt!.path.startsWith('src/core/flow/')).toBe(true);
  }
});
