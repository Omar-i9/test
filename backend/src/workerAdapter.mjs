import { applyEnv } from './config.mjs';
import { createKvJsonFile } from './kvStore.mjs';
import { emptyPushDocument, setPushStore, validatePushDocument } from './pushStore.mjs';

let ready = null;
/** Initialize the push service. Retired `data` and
 * `sessions` KV keys are intentionally left untouched: the old API no longer reads
 * them, and removing remote data requires an independently verified backup. */
export function initWorkerRuntime(env) {
  if (ready) return ready;
  ready = (async () => {
    applyEnv(env);
    const kv = env.TAAMEN_KV_PREVIEW ?? env.TAAMEN_KV;
    if (!kv || typeof kv.get !== 'function') throw new Error('TAAMEN_KV binding is missing.');
    setPushStore(createKvJsonFile({ kv, key: 'push', validate: validatePushDocument, createFallback: async () => emptyPushDocument() }));
  })();
  ready.catch(() => { ready = null; });
  return ready;
}
