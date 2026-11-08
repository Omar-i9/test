import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRegistry, routesForDesktopNav, routesForMobileNav } from './routes.ts';

test('tactical stays in the registry but leaves normal navigation', () => {
  const tactical = routeRegistry.find((route) => route.id === 'tactical');
  assert.ok(tactical);
  assert.equal(tactical.showInMobileNav, false);
  assert.equal(tactical.showInDesktopNav, false);
  assert.equal(routesForMobileNav('normal').some((route) => route.id === 'tactical'), false);
  assert.equal(routesForDesktopNav('normal').some((route) => route.id === 'tactical'), false);
});

test('primary navigation has exactly five product destinations', () => {
  const primary = routesForMobileNav('normal').map((route) => route.id);
  assert.deepEqual(primary, ['home', 'stadiums', 'play', 'analytics', 'assistant']);
  const desktop = routesForDesktopNav('normal').map((route) => route.id);
  assert.deepEqual(desktop, ['home', 'stadiums', 'play', 'analytics', 'assistant']);
});

test('stadiums is a mobile and desktop destination', () => {
  const stadiums = routeRegistry.find((route) => route.id === 'stadiums');
  assert.equal(stadiums?.showInMobileNav, true);
  assert.equal(stadiums?.showInDesktopNav, true);
  assert.equal(routesForMobileNav('normal').some((route) => route.id === 'stadiums'), true);
});

test('assistant is branded TAAMEN AI in both languages', () => {
  const assistant = routeRegistry.find((route) => route.id === 'assistant');
  assert.equal(assistant?.label.ar, 'TAAMEN AI');
  assert.equal(assistant?.label.en, 'TAAMEN AI');
});
