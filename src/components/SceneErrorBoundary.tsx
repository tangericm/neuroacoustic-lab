import { Component } from 'react';
import type { ReactNode } from 'react';

export const sceneUnavailable = <div className="scene-fallback" role="alert">3D rendering is unavailable on this device. Use the target coordinates and field maps below.</div>;

/** The optional 3D renderer must never take the numerical workspace down with it. */
export class SceneErrorBoundary extends Component<{ children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? sceneUnavailable : this.props.children; }
}
