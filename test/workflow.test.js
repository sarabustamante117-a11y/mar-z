const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createTestContext } = require("../fixtures");

const json = (value) => JSON.stringify(value);

test("soporte comenta y resuelve; el solicitante confirma o reabre con comentario", async (t) => {
  const { login, request } = await createTestContext(t);
  const requester = await login("ana@demo.local");
  const support = await login("soporte@demo.local");
  const created = await request("/api/requests", requester.cookie, {
    method: "POST",
    body: json({ title: "Error de acceso", description: "No puedo entrar.", category: "Acceso" }),
  });
  const item = await created.json();
  const endpoint = `/api/requests/${item.id}`;

  await request(`${endpoint}/status`, support.cookie, {
    method: "PATCH",
    body: json({ status: "En Proceso" }),
  });
  const comment = await request(`${endpoint}/comments`, support.cookie, {
    method: "POST",
    body: json({ body: "Estoy revisándolo." }),
  });
  assert.equal(comment.status, 201);
  await request(`${endpoint}/status`, support.cookie, {
    method: "PATCH",
    body: json({ status: "Resuelto" }),
  });

  const noComment = await request(`${endpoint}/reopen`, requester.cookie, {
    method: "POST",
    body: json({ body: " " }),
  });
  assert.equal(noComment.status, 400);
  const reopened = await request(`${endpoint}/reopen`, requester.cookie, {
    method: "POST",
    body: json({ body: "El error continúa." }),
  });
  assert.equal((await reopened.json()).status, "En Proceso");

  await request(`${endpoint}/status`, support.cookie, {
    method: "PATCH",
    body: json({ status: "Resuelto" }),
  });
  const closed = await request(`${endpoint}/confirm`, requester.cookie, {
    method: "POST",
    body: "{}",
  });
  assert.equal((await closed.json()).status, "Cerrado");
  const closedTransition = await request(`${endpoint}/status`, support.cookie, {
    method: "PATCH",
    body: json({ status: "Resuelto" }),
  });
  assert.equal(closedTransition.status, 400);

  const details = await (await request(endpoint, requester.cookie)).json();
  assert.deepEqual(details.comments.map((entry) => entry.body), ["Estoy revisándolo.", "El error continúa."]);
  const edit = await request(`${endpoint}/comments/${details.comments[0].id}`, requester.cookie, {
    method: "DELETE",
  });
  assert.equal(edit.status, 404);
});
