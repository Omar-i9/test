import type { RefObject } from 'react';
import { gsap, useGSAP } from './gsapRuntime';
import { prefersReducedMotion } from './prefersReduced';

/** Home is the busiest page: keep its entrance to one short opacity-only pass.
 * Avoid per-icon transforms, staggered card timelines and independent match
 * reveals so opening the navigation never competes with decorative animation. */
export function useHomeEntrance(root: RefObject<HTMLElement | null>) {
  useGSAP(() => {
    const page = root.current;
    if (!page || prefersReducedMotion()) return;
    const hero = page.querySelector<HTMLElement>('.home-hero');
    if (!hero) return;
    gsap.fromTo(hero, { opacity: 0.985 }, { opacity: 1, duration: 0.12, ease: 'none', clearProps: 'opacity' });
  }, { scope: root });
}

/** Match cards render in place without a second timeline on Home. */
export function useHomeMatchReveal(_root: RefObject<HTMLElement | null>, _count: number) {
  useGSAP(() => undefined, []);
}
