const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createTestContext } = require("../fixtures");

test("cada solicitante consulta únicamente sus solicitudes y no abre detalles ajenos", async (t) => {
  const { login, request } = await createTestContext(t);
  const ana = await login("ana@demo.local");
  const luis = await login("luis@demo.local");
  const anaRequests = await (await request("/api/requests", ana.cookie)).json();
  const luisRequests = await (await request("/api/requests", luis.cookie)).json();

  assert.equal(anaRequests.length, 2);
  assert.equal(luisRequests.length, 2);
  assert.ok(anaRequests.every((item) => item.requesterId === "requester-ana"));
  assert.ok(luisRequests.every((item) => item.requesterId === "requester-luis"));
  assert.notEqual(anaRequests[0].id, luisRequests[0].id);
  assert.equal((await request(`/api/requests/${luisRequests[0].id}`, ana.cookie)).status, 404);
});