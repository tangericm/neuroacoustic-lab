import { findCoreExcerpt, operationFunctions } from './codeSource';
import type { CoreOperation } from './codeSource';
import './code.css';
const sources = import.meta.glob<string>('../core/flow/*.ts', { query: '?raw', import: 'default', eager: true });
export default function CoreCode({ operation }: { operation: CoreOperation }) {
  const excerpts = operationFunctions[operation].map(name => findCoreExcerpt(sources, name));
  return <details className="core-code"><summary>See the core code</summary>
    <p>These reusable functions generated the results shown here. The display loads their frozen output.</p>
    {excerpts.map((excerpt, i) => excerpt ? <section key={excerpt.name}>
      <h4>{excerpt.name}</h4><pre tabIndex={0} aria-label={`${excerpt.name} TypeScript source`}><code>{excerpt.code}</code></pre>
      <a href={`https://github.com/tangericm/ultrasound-lab/blob/main/${excerpt.path}#L${excerpt.line}`} target="_blank" rel="noreferrer">Full source: {excerpt.path}</a>
    </section> : <p key={i}>Source is being prepared.</p>)}
  </details>;
}
