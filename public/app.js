const app = document.querySelector("#app");
const currentPath = location.pathname;
const roles = {
  solicitante: { home: "/mis-solicitudes", name: "Solicitante", links: [["/mis-solicitudes", "Mis solicitudes"], ["/solicitudes/nueva", "Nueva solicitud"]] },
  coordinador: { home: "/coordinacion", name: "Coordinador", links: [["/coordinacion", "Bandeja de trabajo"]] },
  auditor: { home: "/auditoria", name: "Auditor", links: [["/auditoria", "Registro completo"]] },
};
const priorities = ["Urgente", "Alta", "Media", "Baja"];
const priorityRank = { Urgente: 4, Alta: 3, Media: 2, Baja: 1 };
const statusRank = { Nuevo: 1, "En curso": 2, Resuelta: 3 };

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body && { "Content-Type": "application/json" }), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "No se pudo completar la operación."), { status: response.status });
  return data;
}

const date = (value) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const status = (value) => `<span class="status-label status-${value === "Resuelta" ? "done" : value === "En curso" ? "progress" : "new"}"><span></span>${escapeHtml(value)}</span>`;

function layout(user, content) {
  const role = roles[user.role];
  app.innerHTML = `<div class="app-layout"><aside class="sidebar"><a class="wordmark" href="${role.home}">M / solicitudes</a><nav class="main-nav">${role.links.map(([href, label]) => `<a class="nav-link ${currentPath === href ? "is-active" : ""}" href="${href}">${label}</a>`).join("")}</nav><div class="sidebar-bottom"><strong>${escapeHtml(user.name)}</strong><small>${role.name}</small><button id="logout" class="logout-button">Cerrar sesión</button></div></aside><main class="workspace"><div class="workspace-inner">${content}</div></main></div>`;
  document.querySelector("#logout").onclick = async () => { await api("/api/logout", { method: "POST" }); location.assign("/"); };
}

function table(requests, { coordinator = false, requester = false } = {}) {
  if (!requests.length) return '<div class="empty-state"><h3>Aún no hay solicitudes</h3><p>Cuando se registre una, aparecerá aquí.</p></div>';
  return `<div class="table-scroll"><table class="request-table"><thead><tr><th>Solicitud</th>${requester ? "<th>Solicitante</th>" : ""}<th>Prioridad</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${requests.map((item) => `<tr><td><a class="request-title" href="/solicitud/${item.id}">${escapeHtml(item.title)}</a><small>${escapeHtml(item.category)}</small></td>${requester ? `<td>${escapeHtml(item.requesterName)}<small>${escapeHtml(item.requesterEmail)}</small></td>` : ""}<td>${coordinator ? `<select data-id="${item.id}">${priorities.map((value) => `<option ${value === item.priority ? "selected" : ""}>${value}</option>`).join("")}</select>` : escapeHtml(item.priority)}</td><td>${status(item.status)}</td><td>${date(item.createdAt)}</td></tr>`).join("")}</tbody></table></div>`;
}

async function listPage(user, kind) {
  const requests = await api("/api/requests");
  if (kind === "coordinador") return coordinatorPage(user, requests);
  const audit = kind === "auditor";
  layout(user, `<header class="page-header"><div><p class="eyebrow">${audit ? "AUDITORÍA" : "MIS SOLICITUDES"}</p><h1>${audit ? "Registro de solicitudes" : "Mis solicitudes"}</h1><p class="page-lede">${audit ? "Consulta completa en modo de solo lectura." : "Consulta el estado de tus solicitudes."}</p></div>${audit ? `<span>${requests.length} registros</span>` : '<a class="button button-primary" href="/solicitudes/nueva">Nueva solicitud +</a>'}</header>${audit ? "" : `<div class="section-heading"><h2>Solicitudes registradas</h2><span>${requests.length}</span></div>`}${table(requests, { requester: audit })}`);
}

function coordinatorPage(user, requests, sort = "priority", direction = "desc") {
  const rank = sort === "priority" ? priorityRank : sort === "status" ? statusRank : null;
  const sorted = [...requests].sort((a, b) => ((rank ? rank[a[sort]] - rank[b[sort]] : new Date(a.createdAt) - new Date(b.createdAt)) || a.title.localeCompare(b.title, "es")) * (direction === "asc" ? 1 : -1));
  layout(user, `<header class="page-header"><div><p class="eyebrow">COORDINACIÓN</p><h1>Trabajo por ordenar</h1></div><span>${requests.length} solicitudes</span></header><div class="sorting-bar"><label>Ordenar por <select id="sort"><option value="priority">Prioridad</option><option value="status">Estado</option><option value="date">Fecha</option></select></label><button id="direction" class="button button-quiet">${direction === "desc" ? "Descendente ↓" : "Ascendente ↑"}</button></div>${table(sorted, { coordinator: true, requester: true })}`);
  document.querySelector("#sort").value = sort;
  document.querySelector("#sort").onchange = (event) => coordinatorPage(user, requests, event.target.value, direction);
  document.querySelector("#direction").onclick = () => coordinatorPage(user, requests, sort, direction === "desc" ? "asc" : "desc");
  document.querySelectorAll("[data-id]").forEach((select) => { select.onchange = async () => { const updated = await api(`/api/requests/${select.dataset.id}/priority`, { method: "PATCH", body: JSON.stringify({ priority: select.value }) }); requests[requests.findIndex((item) => item.id === updated.id)] = updated; coordinatorPage(user, requests, sort, direction); }; });
}

function login() {
  app.innerHTML = `<div class="login-layout"><section class="login-intro"><a class="wordmark" href="/">M / solicitudes</a><h1>Las cosas empiezan por <span>escuchar.</span></h1><p>Un solo lugar para pedir ayuda y dar seguimiento.</p></section><section class="login-panel"><form id="login-form"><h2>Iniciar sesión</h2><label>Correo electrónico<input name="email" type="email" required></label><label>Contraseña<input name="password" type="password" required></label><p id="login-error" class="form-error" hidden></p><button class="button button-primary" type="submit">Entrar →</button></form></section></div>`;
  document.querySelector("#login-form").onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; try { location.assign((await api("/api/login", { method: "POST", body: JSON.stringify({ email: form.email.value, password: form.password.value }) })).home); } catch (error) { const message = document.querySelector("#login-error"); message.textContent = error.message; message.hidden = false; } };
}

function newRequest(user) {
  layout(user, `<header class="page-header"><div><p class="eyebrow">NUEVA SOLICITUD</p><h1>Crear solicitud</h1></div></header><form id="request-form" class="request-form"><label>Título<input name="title" maxlength="120" required></label><label>Descripción<textarea name="description" maxlength="5000" required></textarea></label><label>Categoría<select name="category" required><option value="">Selecciona una categoría</option><option>Acceso</option><option>Hardware</option><option>Software</option><option>Red</option><option>Otro</option></select></label><p id="request-error" class="form-error" hidden></p><div class="form-actions"><a class="button button-quiet" href="/mis-solicitudes">Cancelar</a><button class="button button-primary">Enviar solicitud →</button></div></form>`);
  document.querySelector("#request-form").onsubmit = async (event) => { event.preventDefault(); const form = event.currentTarget; try { const created = await api("/api/requests", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) }); location.assign(`/solicitud/${created.id}`); } catch (error) { const message = document.querySelector("#request-error"); message.textContent = error.message; message.hidden = false; } };
}

async function detail(user, id) {
  const item = await api(`/api/requests/${id}`);
  layout(user, `<header class="page-header"><div><p class="eyebrow">DETALLE</p><h1>${escapeHtml(item.title)}</h1><p>${date(item.createdAt)}</p></div><a class="button button-quiet" href="${roles[user.role].home}">← Volver</a></header><dl class="detail-grid"><div class="detail-pair"><dt>Estado</dt><dd>${status(item.status)}</dd></div><div class="detail-pair"><dt>Prioridad</dt><dd>${escapeHtml(item.priority)}</dd></div><div class="detail-pair"><dt>Categoría</dt><dd>${escapeHtml(item.category)}</dd></div>${user.role === "solicitante" ? "" : `<div class="detail-pair"><dt>Solicitante</dt><dd>${escapeHtml(item.requesterName)}<small>${escapeHtml(item.requesterEmail)}</small></dd></div>`}<div class="detail-pair detail-description"><dt>Descripción</dt><dd>${escapeHtml(item.description).replace(/\n/g, "<br>")}</dd></div></dl>`);
}

async function start() {
  let user;
  try { user = await api("/api/session"); } catch { return currentPath === "/" || currentPath === "/index.html" ? login() : (app.innerHTML = '<p class="access-message">Inicia sesión para continuar.</p>'); }
  if (currentPath === "/" || currentPath === "/index.html") return location.replace(roles[user.role].home);
  try {
    const pages = { "/mis-solicitudes": () => listPage(user, "solicitante"), "/solicitudes/nueva": () => newRequest(user), "/coordinacion": () => listPage(user, "coordinador"), "/auditoria": () => listPage(user, "auditor") };
    const match = currentPath.match(/^\/solicitud\/([0-9a-f-]{36})$/i);
    return match ? detail(user, match[1]) : pages[currentPath]?.();
  } catch (error) { app.innerHTML = `<p class="access-message">${escapeHtml(error.message)}</p>`; }
}
start();
