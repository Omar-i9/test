import { createMemoryDocument, setPushStore } from './pushStore.mjs';
let initialized = false;
export function initNodeRuntime() {
  if (initialized) return;
  setPushStore(createMemoryDocument());
  initialized = true;
}
export function resetNodeRuntime() { initialized = false; initNodeRuntime(); }
