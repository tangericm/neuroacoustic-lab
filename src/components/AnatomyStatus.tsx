import { Component, useEffect } from 'react';
import type { ReactNode } from 'react';

export type AnatomyLoadState = 'loading' | 'ready' | 'error';

/** Runs only after the atlas has loaded and its actual geometry has committed. */
export function AnatomyReady({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}
export class AnatomyBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
/** This DOM label belongs to the outer React tree, never a renderer-owned portal. */
export function AnatomyStatus({ state }: { state: AnatomyLoadState }) {
  if (state === 'ready') return null;
  return <div className="anatomy-overlay"><span className="anatomy-status" role={state === 'error' ? 'alert' : 'status'}>{state === 'loading' ? 'Loading anatomical atlas…' : 'Anatomical atlas unavailable. Acoustic ellipsoids remain visible.'}</span></div>;
}
