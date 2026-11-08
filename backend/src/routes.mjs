import { config } from './config.mjs';
import {
  HttpError, clientIp, isSecureRequest, jsonResponse, noContentResponse,
  readJsonBody, withTransportHeaders,
} from './http.mjs';
import { createRateLimiter } from './rateLimit.mjs';
import { requiredEmail, requiredString } from './validate.mjs';
import { contactConfigured, sendContactMessage } from './contact.mjs';
import { pushPublicConfig, pushSchedule, pushSubscribe, pushTest, pushUnsubscribe } from './pushHttp.mjs';
import { vapidConfigured } from './webPush.mjs';

const contactLimiter = createRateLimiter({ maxAttempts: 3, windowMs: 10 * 60_000, cooldownMs: 30 * 60_000 });

const routes = [
  {
    method: 'GET',
    path: '/api/ai/quota',
    handler: ({ request }) => jsonResponse(request, 503, {
      error: 'TAAMEN AI يحتاج بيئة Cloudflare Worker. شغّل معاينة Cloudflare أو استخدم النسخة المنشورة بعد إعداد الربط.',
    }),
  },
  {
    method: 'POST',
    path: '/api/ai/chat',
    handler: ({ request }) => jsonResponse(request, 503, {
      error: 'TAAMEN AI غير متاح في خادم Node المحلي. استخدم معاينة Cloudflare بعد إعداد AI Binding وعداد الاستخدام.',
    }),
  },
  {
    method: 'GET',
    path: '/',
    handler: ({ request }) => jsonResponse(request, 200, { name: 'TAAMEN API', status: 'ok' }),
  },

  {
    method: 'GET',
    path: '/api/health',
    handler: ({ request }) => jsonResponse(request, 200, {
      ok: true,
      service: 'taamen-api',
      emailConfigured: contactConfigured(),
      pushConfigured: vapidConfigured(),
    }),
  },

  {
    method: 'POST',
    path: '/api/public/contact',
    handler: async ({ request, ip }) => {
      if (!contactLimiter.check(ip)) {
        throw new HttpError(429, 'Too many messages. Try again later.');
      }
      const body = await readJsonBody(request);
      const email = requiredEmail(body, 'email', { max: config.contact.maxEmailLength });
      const message = requiredString(body, 'message', { min: 3, max: config.contact.maxMessageLength });
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length > config.contact.maxNameLength) {
        throw new HttpError(400, 'name is too long.');
      }
      if (!contactConfigured()) {
        throw new HttpError(503, 'The contact channel is not configured.');
      }
      const result = await sendContactMessage({ email, message, name });
      if (!result.contactSent) throw new HttpError(502, 'The message could not be delivered.');
      return jsonResponse(request, 200, {
        ok: true,
        contactSent: true,
        autoReplySent: result.autoReplySent === true,
      });
    },
  },

  {
    method: 'GET',
    path: '/api/push/config',
    handler: ({ request }) => pushPublicConfig(request),
  },
  {
    method: 'POST',
    path: '/api/push/subscribe',
    handler: ({ request, ip }) => pushSubscribe(request, ip),
  },
  {
    method: 'POST',
    path: '/api/push/unsubscribe',
    handler: ({ request, ip }) => pushUnsubscribe(request, ip),
  },
  {
    method: 'POST',
    path: '/api/push/schedule',
    handler: ({ request, ip }) => pushSchedule(request, ip),
  },
  {
    method: 'POST',
    path: '/api/push/test',
    handler: ({ request, ip }) => pushTest(request, ip),
  },
];

function matchRoute(pathname) {
  const candidates = [];
  for (const route of routes) {
    if (route.path) {
      if (route.path === pathname) candidates.push({ route, params: [] });
      continue;
    }
    const found = route.pattern.exec(pathname);
    if (found) candidates.push({ route, params: found.slice(1) });
  }
  return candidates;
}

function csrfHeader(request) {
  if (typeof request.headers.get === 'function') {
    return request.headers.get(config.csrfHeader);
  }
  return request.headers[config.csrfHeader];
}

/**
 * Shared TAAMEN API. Both the local Node adapter and the Cloudflare Worker
 * adapter call this with a Fetch Request.
 */
export async function handleFetch(request, platform = {}) {
  const response = await routeRequest(request, platform);
  return withTransportHeaders(response, isSecureRequest(request, platform));
}

async function routeRequest(request, platform = {}) {
  const url = new URL(request.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const secure = isSecureRequest(request, platform);
  const ip = clientIp(request, platform);

  if (config.requireHttps && !secure) {
    return jsonResponse(request, 426, { error: 'HTTPS is required.' });
  }

  if (request.method === 'OPTIONS') {
    return noContentResponse(request, 204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': `Content-Type, ${config.csrfHeader}`,
      'Access-Control-Max-Age': '600',
    });
  }

  const candidates = matchRoute(pathname);
  if (!candidates.length) return jsonResponse(request, 404, { error: 'Not found.' });

  const chosen = candidates.find(candidate => candidate.route.method === request.method);
  if (!chosen) {
    const allowed = [...new Set(candidates.map(candidate => candidate.route.method))].join(', ');
    return jsonResponse(request, 405, { error: 'Method not allowed.' }, { Allow: allowed });
  }

  const mutating = request.method !== 'GET' && request.method !== 'HEAD';
  if (mutating && !csrfHeader(request)) {
    return jsonResponse(request, 403, { error: 'Missing required request header.' });
  }

  try {
    return await chosen.route.handler({
      request,
      ip,
      secure,
      params: chosen.params,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, error.status, { error: error.message });
    }
    console.error('[taamen] unhandled request error:', error);
    return jsonResponse(request, 500, { error: 'Internal server error.' });
  }
}
