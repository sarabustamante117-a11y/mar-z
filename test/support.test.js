const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createTestContext } = require("../fixtures");

test("soporte puede avanzar el estado; el solicitante no puede cambiarlo", async (t) => {
  const { login, request } = await createTestContext(t);
  const requester = await login("ana@demo.local");
  const support = await login("soporte@demo.local");
  const created = await request("/api/requests", requester.cookie, {
    method: "POST",
    body: JSON.stringify({
      title: "No abre el correo",
      description: "El portal muestra un error.",
      category: "Acceso",
    }),
  });
  const item = await created.json();
  const endpoint = `/api/requests/${item.id}/status`;

  const started = await request(endpoint, support.cookie, {
    method: "PATCH",
    body: JSON.stringify({ status: "En Proceso" }),
  });
  const requesterChange = await request(endpoint, requester.cookie, {
    method: "PATCH",
    body: JSON.stringify({ status: "Resuelto" }),
  });
  const invalidState = await request(endpoint, support.cookie, {
    method: "PATCH",
    body: JSON.stringify({ status: "Cerrado" }),
  });

  assert.equal(started.status, 200);
  assert.equal((await started.json()).status, "En Proceso");
  assert.equal(requesterChange.status, 403);
  assert.equal(invalidState.status, 400);
});
