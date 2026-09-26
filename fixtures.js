const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("./server");

const DEMO_PASSWORD = "Demo2026!";

async function createTestContext(testContext) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-solicitudes-test-"));
  const server = createServer({ dataFile: path.join(temporaryDirectory, "store.json") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  testContext.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  async function request(url, cookie, options = {}) {
    return fetch(`${baseUrl}${url}`, {
      ...options,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  }

  async function login(email, password = DEMO_PASSWORD) {
    const response = await request("/api/login", null, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return { response, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }

  return { login, request };
}

module.exports = { createTestContext, DEMO_PASSWORD };