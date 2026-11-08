import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function stripJsonComments(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      } else {
        output += ' ';
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        inBlockComment = false;
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      inLineComment = true;
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      inBlockComment = true;
    } else {
      output += char;
    }
  }

  // Wrangler's JSONC accepts trailing commas. Remove them only outside strings.
  let clean = '';
  inString = false;
  escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      clean += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      clean += char;
      continue;
    }
    if (char === ',') {
      let lookahead = index + 1;
      while (/\s/.test(output[lookahead] || '')) lookahead += 1;
      if (output[lookahead] === '}' || output[lookahead] === ']') continue;
    }
    clean += char;
  }
  return clean;
}

async function readConfig() {
  const source = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  return JSON.parse(stripJsonComments(source));
}

test('Wrangler config defines the AI and quota bindings in the default environment', async () => {
  const config = await readConfig();
  assert.equal(config.ai?.binding, 'AI');
  assert.equal(config.ai?.remote, true, 'Vite preview must use the real Workers AI binding');
  assert.equal(config.durable_objects?.bindings?.filter(binding => binding.name === 'AI_QUOTA' && binding.class_name === 'AiDailyQuota').length, 1);
  assert.ok(config.migrations?.some(migration => migration.tag === 'v11-ai-quota-v1' && migration.new_sqlite_classes?.includes('AiDailyQuota')));
});

test('production has its own non-inherited AI and Durable Object bindings', async () => {
  const config = await readConfig();
  const production = config.env?.production;
  assert.equal(production?.name, config.name);
  assert.equal(production?.ai?.binding, 'AI');
  assert.equal(production?.ai?.remote, true, 'Production-targeted Vite preview must use the real Workers AI binding');
  assert.equal(production?.durable_objects?.bindings?.filter(binding => binding.name === 'AI_QUOTA' && binding.class_name === 'AiDailyQuota').length, 1);
  // Preserve the original V11 SQLite migration; do not create a duplicate class migration in V12.
  assert.equal(production?.migrations, undefined);
  assert.equal(production?.d1_databases, undefined, 'Production must omit D1 entirely; the top-level database belongs to Preview only.');
  assert.ok(config.migrations?.some(migration => migration.tag === 'v11-ai-quota-v1' && migration.new_sqlite_classes?.includes('AiDailyQuota')));
});

test('AI and tactical-plan routes run before ordinary backend initialization', async () => {
  const worker = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const planDispatch = worker.indexOf("url.pathname === '/api/plans'");
  const aiDispatch = worker.indexOf("url.pathname.startsWith('/api/ai/')");
  const backendInit = worker.indexOf('initWorkerRuntime(env)');
  assert.ok(planDispatch >= 0);
  assert.ok(aiDispatch >= 0);
  assert.ok(planDispatch < backendInit);
  assert.ok(aiDispatch < backendInit);
  assert.match(worker, /export\s*\{\s*AiDailyQuota\s*\}/);
});


test('the TAAMEN AI page is connected through the UI, API service, Worker, and model binding', async () => {
  const [routes, app, page, service, worker, ai] = await Promise.all([
    readFile(new URL('../src/config/routes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Assistant.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/assistantAI.ts', import.meta.url), 'utf8'),
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    readFile(new URL('./ai.js', import.meta.url), 'utf8'),
  ]);

  assert.match(routes, /id:\s*'assistant'/);
  assert.match(app, /page===?['\"]assistant['\"]/);
  assert.match(page, /askAssistantAI\(/);
  assert.match(service, /\/ai\/chat/);
  assert.match(worker, /handleTaamenAI\(request, env, ip\)/);
  assert.match(ai, /env\.AI\.run\(MODEL_ID/);
});
