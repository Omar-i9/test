import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');

test('topbar brand is logo-only and navigates home', () => {
  assert.match(app, /className="topbar-brand" onClick=\{\(\)=>go\('home'\)\}[^>]*>[\s\n]*<img className="brand-image"/);
  assert.doesNotMatch(app, /className="topbar-brand"[^>]*>[\s\S]{0,180}TAAMENN? 2\.0/);
});

test('expanded sidebar uses the text-only TAAMEN 2.0 home link', () => {
  assert.match(app, /className="brand-identity" onClick=\{\(\)=>go\('home'\)\}/);
  assert.match(app, /<span className="brand-name">TAAMEN 2\.0<\/span>/);
  assert.doesNotMatch(app, /className="brand-identity"[^>]*>[\s\S]{0,180}<img/);
});

test('Acquisition and SideProjectors entry points are removed from the app shell', () => {
  assert.doesNotMatch(app, /SideProjectorsBadge|acquisition-nav|AcquisitionPage/);
  assert.match(app, /path\s*===\s*'\/acquisition'/);
  assert.match(app, /removed-acquisition/);
});

test('secondary back routes keep account hub and topbar profile origin distinct', () => {
  assert.match(app, /secondaryBackTargetsRef\.current\[p\]='account-hub'/);
  assert.match(app, /options\?\.source==='topbar-avatar'\?current:'account-hub'/);
  assert.match(app, /go\('profile',\{source:'topbar-avatar'\}\)/);
});
