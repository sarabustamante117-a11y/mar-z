const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createTestContext } = require("../fixtures");

test("crear solicitud valida los obligatorios y fija ID, fecha y estado en el servidor", async (t) => {
  const { login, request } = await createTestContext(t);
  const requester = await login("ana@demo.local");
  const missingFields = await request("/api/requests", requester.cookie, {
    method: "POST",
    body: JSON.stringify({ title: "Sin detalle" }),
  });
  assert.equal(missingFields.status, 400);

  const created = await request("/api/requests", requester.cookie, {
    method: "POST",
    body: JSON.stringify({
      title: "Permiso a carpeta compartida",
      description: "Necesito acceso para preparar el informe.",
      category: "Acceso",
      id: "id-elegido-por-cliente",
      status: "Resuelta",
      createdAt: "2000-01-01T00:00:00.000Z",
    }),
  });
  const result = await created.json();

  assert.equal(created.status, 201);
  assert.match(result.id, /^[0-9a-f-]{36}$/i);
  assert.notEqual(result.id, "id-elegido-por-cliente");
  assert.equal(result.status, "Nuevo");
  assert.ok(Date.parse(result.createdAt) > Date.parse("2020-01-01T00:00:00.000Z"));
  assert.equal(result.requesterId, "requester-ana");
});