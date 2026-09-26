const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createTestContext } = require("../fixtures");

test("solo coordinación puede cambiar una prioridad válida", async (t) => {
  const { login, request } = await createTestContext(t);
  const coordinator = await login("coordinacion@demo.local");
  const requester = await login("ana@demo.local");
  const auditor = await login("auditoria@demo.local");
  const [target] = await (await request("/api/requests", coordinator.cookie)).json();
  const endpoint = `/api/requests/${target.id}/priority`;
  const body = JSON.stringify({ priority: "Urgente" });

  const changed = await request(endpoint, coordinator.cookie, { method: "PATCH", body });
  const requesterResult = await request(endpoint, requester.cookie, { method: "PATCH", body });
  const auditorResult = await request(endpoint, auditor.cookie, { method: "PATCH", body });
  const invalidPriority = await request(endpoint, coordinator.cookie, {
    method: "PATCH",
    body: JSON.stringify({ priority: "Inmediata" }),
  });

  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).priority, "Urgente");
  assert.equal(requesterResult.status, 403);
  assert.equal(auditorResult.status, 403);
  assert.equal(invalidPriority.status, 400);
});