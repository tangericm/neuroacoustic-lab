import { useCallback, useEffect, useRef, useState } from 'react';
import type { OptimizationResult, Scenario, SimulationResult, WorkerRequest, WorkerResponse } from '../core/types';
import { acceptsResult } from './uiUtils';

export function useSimulation(scenario: Scenario, onOptimize: (s: Scenario) => void) {
  const [result, setResult] = useState<SimulationResult>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 1]);
  const [optimization, setOptimization] = useState<OptimizationResult>();
  const worker = useRef<Worker | null>(null);
  const active = useRef(false);
  const requestedId = useRef(0);
  const debounceTimer = useRef<number | undefined>(undefined);
  const latest = useRef(0);
  const onOptimized = useRef(onOptimize); onOptimized.current = onOptimize;
  const replaceWorker = useCallback(() => {
    worker.current?.terminate();
    const next = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
    next.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (worker.current !== next) return;
      if (data.type !== 'progress') active.current = false;
      if (!acceptsResult(latest.current, data.id)) return;
      if (data.type === 'result') { setResult(data.result); setBusy(false); }
      if (data.type === 'error') { setError(data.message); setBusy(false); setOptimizing(false); }
      if (data.type === 'progress') setProgress([data.completed, data.total]);
      if (data.type === 'optimized') { setOptimization(data.result); setOptimizing(false); onOptimized.current(data.result.scenario); }
    };
    next.onerror = e => { if (worker.current !== next || requestedId.current !== latest.current) return; active.current = false; setError(e.message || 'The simulation worker stopped unexpectedly.'); setBusy(false); setOptimizing(false); };
    worker.current = next;
    return next;
  }, []);
  useEffect(() => { replaceWorker(); return () => { ++latest.current; worker.current?.terminate(); worker.current = null; }; }, [replaceWorker]);
  useEffect(() => {
    const id = ++latest.current;
    setBusy(true); setError('');
    const timer = window.setTimeout(() => {
      const next = active.current || !worker.current ? replaceWorker() : worker.current;
      const request: WorkerRequest = { type: 'simulate', id, scenario };
      requestedId.current = id; active.current = true; next.postMessage(request); setOptimizing(false);
    }, 180);
    debounceTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [scenario, replaceWorker]);
  const optimize = useCallback(() => {
    window.clearTimeout(debounceTimer.current);
    const id = ++latest.current;
    setOptimizing(true); setBusy(true); setError(''); setProgress([0, 1]);
    requestedId.current = id; active.current = true; replaceWorker().postMessage({ type: 'optimize', id, scenario } satisfies WorkerRequest);
  }, [scenario, replaceWorker]);
  const cancel = useCallback(() => {
    window.clearTimeout(debounceTimer.current);
    const id = ++latest.current;
    setOptimizing(false); setBusy(true);
    requestedId.current = id; active.current = true; replaceWorker().postMessage({ type: 'simulate', id, scenario } satisfies WorkerRequest);
  }, [scenario, replaceWorker]);
  const clearOptimization = useCallback(() => { setOptimization(undefined); setProgress([0, 1]); setError(''); }, []);
  return { result, busy, error, optimizing, progress, optimization, optimize, cancel, clearOptimization };
}
