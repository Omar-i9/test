import type { CSSProperties, ReactNode } from 'react';
import { isCompactViewport } from './prefersReduced';
import type { RouteId } from '../config/routes';

type StageProfile = { travel: number; duration: number };

/**
 * Motion per route purpose, in pixels and milliseconds. Data-heavy pages stay
 * short. Home skips the wrapper because it choreographs its own groups, and
 * the tactical board only fades so no transform can fight the drag logic.
 */
const STAGE: Record<RouteId | 'default', StageProfile> = {
  default: { travel: 12, duration: 240 },
  home: { travel: 0, duration: 0 },
  play: { travel: 12, duration: 240 },
  analytics: { travel: 12, duration: 240 },
  assistant: { travel: 12, duration: 240 },
  'account-hub': { travel: 14, duration: 250 },
  archive: { travel: 12, duration: 240 },
  'match-center': { travel: 12, duration: 240 },
  stadiums: { travel: 12, duration: 240 },
  profile: { travel: 14, duration: 250 },
  support: { travel: 14, duration: 250 },
  settings: { travel: 0, duration: 150 },
  tactical: { travel: 0, duration: 150 },
};

/**
 * Plays the incoming half of a route change. The route has already switched by
 * the time this renders, so navigation never waits for motion.
 */
export default function PageStage({ page, children }: { page: RouteId; children: ReactNode }) {
  const profile = STAGE[page] ?? STAGE.default;
  if (profile.duration === 0) return <div className="page-stage">{children}</div>;

  const compact = isCompactViewport();
  const travel = profile.travel === 0 ? 0 : (compact ? 4 : Math.min(6, profile.travel));
  const duration = compact ? Math.min(150, profile.duration) : Math.min(220, profile.duration);
  const style = {
    '--ta-page-travel': `${travel}px`,
    '--ta-page-ms': `${duration}ms`,
  } as CSSProperties;

  return <div key={page} className="page-stage is-entering" style={style}>{children}</div>;
}
