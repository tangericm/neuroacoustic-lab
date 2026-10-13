import { expect, it } from 'vitest';
import { withoutScenarioDetails } from '../src/telemetry';

it('removes scenario data from page views and vitals without changing the original event', () => {
  for (const type of ['pageview', 'vital']) {
    const event = { type, url: 'https://neuroacoustic-lab.vercel.app/?view=lab#s=private-scenario', route: '/' };
    expect(withoutScenarioDetails(event)).toEqual({ ...event, url: 'https://neuroacoustic-lab.vercel.app/' });
    expect(event.url).toContain('private-scenario');
  }
  expect(withoutScenarioDetails({ url: 'https://neuroacoustic-lab.vercel.app/example' }).url)
    .toBe('https://neuroacoustic-lab.vercel.app/example');
});
