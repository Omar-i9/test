import { resolveAuthenticatedCloudUser } from './cloudAuth.js';

/**
 * V19 verified identity boundary.
 * Identity comes only from an opaque HttpOnly session cookie whose hash is held in D1.
 * Never infer ownership from a LocalProfile, email field, install ID, request body or URL.
 */
export { resolveAuthenticatedCloudUser };
