/**
 * Minimal Cloudflare KV JSON document adapter retained for the push queue only.
 * It intentionally has no member, account, archive, or session-store logic.
 */
export function createKvJsonFile({ kv, key, validate, createFallback }) {
  if (!kv || typeof kv.get !== 'function' || typeof kv.put !== 'function') {
    throw new TypeError('A readable and writable KV binding is required.');
  }
  if (typeof key !== 'string' || !key) throw new TypeError('A KV document key is required.');
  if (typeof validate !== 'function' || typeof createFallback !== 'function') {
    throw new TypeError('KV document validation and fallback functions are required.');
  }

  let state = null;
  let queue = Promise.resolve();

  async function loadState() {
    if (state !== null) return state;
    const raw = await kv.get(key, { type: 'text' });
    if (raw !== null && raw !== undefined && raw !== '') {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`Stored KV document "${key}" is not valid JSON.`);
      }
      state = validate(parsed);
      return state;
    }
    state = validate(await createFallback());
    await kv.put(key, JSON.stringify(state));
    return state;
  }

  function enqueue(operation) {
    const result = queue.then(operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    load() {
      return enqueue(loadState);
    },
    read(reader) {
      if (typeof reader !== 'function') throw new TypeError('A reader callback is required.');
      return enqueue(async () => reader(await loadState()));
    },
    update(mutator) {
      if (typeof mutator !== 'function') throw new TypeError('An update callback is required.');
      return enqueue(async () => {
        const document = await loadState();
        const result = await mutator(document);
        await kv.put(key, JSON.stringify(document));
        return result;
      });
    },
  };
}
