/** No member directory or historical dataset is required by the V10 API. */
export function prepareEnvironment(label) {
  process.env.NODE_ENV = 'test';
  delete process.env.TAAMEN_DATA_FILE;
  delete process.env.TAAMEN_SESSION_FILE;
  process.env.CORS_ORIGIN = 'http://localhost:5173';
  process.env.TRUST_PROXY = 'false';
  process.env.REQUIRE_HTTPS = 'false';
  return label;
}

/** Start the server on an ephemeral port and return a small request client. */
export async function startTestServer(createServer) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  /**
   * `cookie` is passed explicitly rather than kept in a shared jar, so each test
   * states which identity it is acting as.
   */
  async function call(method, route, { body, cookie, headers = {}, csrf = true } = {}) {
    const requestHeaders = { ...headers };
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    if (cookie) requestHeaders.Cookie = cookie;
    if (csrf && method !== 'GET') requestHeaders['X-TAAMEN-Requested'] = '1';

    const response = await fetch(`${base}${route}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    return {
      status: response.status,
      body: payload,
      setCookie: response.headers.getSetCookie?.() || [],
      headers: response.headers,
    };
  }

  return {
    base,
    call,
    get: (route, options) => call('GET', route, options),
    post: (route, options) => call('POST', route, options),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

