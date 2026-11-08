import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFetch } from '../src/routes.mjs';

test('retired member and Challenge #01 APIs are not exposed', async () => {
  for (const path of ['/api/featured/member', '/api/auth/session', '/api/auth/logout', '/api/private/historical', '/api/challenge/config', '/api/challenge/me', '/api/challenge/events']) {
    const response = await handleFetch(new Request(`https://taamenn.test${path}`), { encrypted: true, ip: 'test' });
    assert.equal(response.status, 404, `${path} must not exist`);
  }
});
