import { handleTaamenAI, AiDailyQuota } from './ai.js';
import { handleFetch } from '../backend/src/routes.mjs';
import { initWorkerRuntime } from '../backend/src/workerAdapter.mjs';
import { processDuePushJobs } from '../backend/src/pushDispatch.mjs';
import { handleTacticalPlans } from './tacticalPlans.js';
import { handleSyncEngine } from './syncEngine.js';
import { handleCloudAuth } from './cloudAuth.js';

/**
 * Cloudflare Worker adapter.
 * Static SPA assets are served by the Vite/Workers assets pipeline.
 * AI endpoints are handled here so inference and quota storage remain server-side.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Verified cloud-account routes use D1 directly and must not depend on the legacy KV bootstrap.
    if (url.pathname.startsWith('/api/auth/')) {
      return handleCloudAuth(request, env);
    }

    // Structured cloud sync routes use D1 directly and must not depend on the push KV bootstrap.
    if (url.pathname === '/api/sync/push' || url.pathname === '/api/sync/pull') {
      return handleSyncEngine(request, env);
    }

    // Tactical-plan routes use D1 directly and must not depend on the push KV bootstrap.
    if (url.pathname === '/api/plans' || url.pathname.startsWith('/api/plans/')) {
      return handleTacticalPlans(request, env);
    }

    if (url.pathname.startsWith('/api/ai/')) {
      const forwarded = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
      const ip = request.headers.get('CF-Connecting-IP')
        || (env.TRUST_PROXY === 'true' && forwarded ? forwarded : '')
        || 'unknown';
      return handleTaamenAI(request, env, ip);
    }

    if (!url.pathname.startsWith('/api')) {
      return new Response(JSON.stringify({ error: 'Not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    try {
      await initWorkerRuntime(env);
    } catch {
      console.error('[taamen] worker init failed');
      return new Response(JSON.stringify({ error: 'TAAMEN server is unavailable.' }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const forwarded = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const ip = request.headers.get('CF-Connecting-IP')
      || (env.TRUST_PROXY === 'true' && forwarded ? forwarded : '')
      || 'unknown';

    return handleFetch(request, {
      ip,
      encrypted: url.protocol === 'https:',
    });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      await initWorkerRuntime(env);
      await processDuePushJobs(Date.now());
    })());
  },
};

export { AiDailyQuota };
