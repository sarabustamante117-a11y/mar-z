const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createTestContext, DEMO_PASSWORD } = require("../fixtures");

test("el login responde lo mismo para un correo inexistente y una contraseña incorrecta", async (t) => {
  const { request } = await createTestContext(t);
  const unknown = await request("/api/login", null, {
    method: "POST",
    body: JSON.stringify({ email: "nadie@demo.local", password: DEMO_PASSWORD }),
  });
  const wrongPassword = await request("/api/login", null, {
    method: "POST",
    body: JSON.stringify({ email: "ana@demo.local", password: "incorrecta" }),
  });

  assert.equal(unknown.status, 401);
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(await unknown.json(), { error: "Credenciales inválidas." });
  assert.deepEqual(await wrongPassword.json(), { error: "Credenciales inválidas." });
});

test("las rutas privadas requieren el rol correcto", async (t) => {
  const { login, request } = await createTestContext(t);
  const anonymousPage = await request("/bandeja", null, { redirect: "manual" });
  const requester = await login("ana@demo.local");
  const forbiddenPage = await request("/bandeja", requester.cookie);
  const allowedPage = await request("/mis-solicitudes", requester.cookie);
  const support = await login("soporte@demo.local");
  const supportCreate = await request("/api/requests", support.cookie, {
    method: "POST",
    body: JSON.stringify({ title: "No permitido", description: "Solo soporte", category: "Otro" }),
  });

  assert.equal(anonymousPage.status, 302);
  assert.equal(forbiddenPage.status, 403);
  assert.equal(allowedPage.status, 200);
  assert.equal(supportCreate.status, 403);
});