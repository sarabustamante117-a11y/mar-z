const app = document.querySelector("#app");
const path = location.pathname;
const roles = {
  solicitante: { name: "Solicitante", home: "/mis-solicitudes" },
  soporte: { name: "Soporte", home: "/bandeja" },
};

function escapeHtml(value) {
  const characters = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value || "").replace(/[&<>"']/g, (character) => characters[character]);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function api(url, options = {}) {
  const headers = {};
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { ...options, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
  return result;
}

function layout(user, content) {
  const role = roles[user.role];
  const link = user.role === "solicitante"
    ? '<a class="nav-link" href="/mis-solicitudes">Mis solicitudes</a>'
    : '<a class="nav-link" href="/bandeja">Bandeja</a>';

  app.innerHTML = `<div class="app-layout"><aside class="sidebar">
    <a class="wordmark" href="${role.home}">Mesa de soporte</a>
    <nav class="main-nav">${link}</nav>
    <div class="sidebar-bottom"><strong>${escapeHtml(user.name)}</strong><small>${role.name}</small><button id="logout" class="logout-button">Cerrar sesión</button></div>
  </aside><main class="workspace"><div class="workspace-inner">${content}</div></main></div>`;

  document.querySelector("#logout").onclick = async () => {
    await api("/api/logout", { method: "POST" });
    location.assign("/");
  };
}

function header(title, label, action = "") {
  return `<header class="page-header"><div><p class="eyebrow">${label}</p><h1>${escapeHtml(title)}</h1></div>${action}</header>`;
}

function statusLabel(status) {
  const className = status === "Resuelto" || status === "Cerrado" ? "done" : "progress";
  return `<span class="status-label status-${className}"><span></span>${escapeHtml(status)}</span>`;
}

function requestTable(requests, user) {
  if (requests.length === 0) return '<p class="empty-state">No hay solicitudes todavía.</p>';
  let rows = "";
  for (const item of requests) {
    const requester = user.role === "soporte" ? `<td>${escapeHtml(item.requesterName)}</td>` : "";
    let status = statusLabel(item.status);
    if (user.role === "soporte" && item.status === "Nuevo") {
      status = `<select data-status="${item.id}"><option>Nuevo</option><option>En Proceso</option></select>`;
    }
    if (user.role === "soporte" && item.status === "En Proceso") {
      status = `<select data-status="${item.id}"><option>En Proceso</option><option>Resuelto</option></select>`;
    }
    rows += `<tr><td><a class="request-title" href="/solicitud/${item.id}">${escapeHtml(item.title)}</a><small>${escapeHtml(item.category)}</small></td>${requester}<td>${status}</td><td>${formatDate(item.createdAt)}</td></tr>`;
  }
  const requesterHeading = user.role === "soporte" ? "<th>Solicitante</th>" : "";
  return `<div class="table-scroll"><table class="request-table"><thead><tr><th>Solicitud</th>${requesterHeading}<th>Estado</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function listPage(user) {
  const requests = await api("/api/requests");
  const isRequester = user.role === "solicitante";
  const title = isRequester ? "Mis solicitudes" : "Solicitudes de soporte";
  const label = isRequester ? "MIS SOLICITUDES" : "BANDEJA DE SOPORTE";
  const action = isRequester ? '<a class="button button-primary" href="/solicitudes/nueva">Nueva solicitud +</a>' : "";
  const content = `${header(title, label, action)}
    <div class="section-heading"><h2>Solicitudes</h2><span>${requests.length}</span></div>
    <div id="request-list">${requestTable(requests, user)}</div>`;
  layout(user, content);

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.onchange = async () => {
      await api(`/api/requests/${select.dataset.status}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value }),
      });
      await listPage(user);
    };
  });
}

function loginPage() {
  app.innerHTML = `<div class="login-layout">
    <section class="login-intro"><a class="wordmark" href="/">Mesa de soporte</a><h1>¿En qué podemos ayudarte?</h1></section>
    <section class="login-panel"><form id="login-form"><h2>Iniciar sesión</h2>
      <label>Correo<input name="email" type="email" required></label>
      <label>Contraseña<input name="password" type="password" required></label>
      <p id="login-error" class="form-error" hidden></p><button class="button button-primary">Entrar</button>
    </form></section>
  </div>`;

  document.querySelector("#login-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email.value, password: form.password.value }),
      });
      location.assign(result.home);
    } catch (error) {
      const message = document.querySelector("#login-error");
      message.textContent = "Credenciales inválidas";
      message.hidden = false;
    }
  };
}

function formData(form) {
  const result = {};
  new FormData(form).forEach((value, name) => { result[name] = value; });
  return result;
}

function newRequestPage(user) {
  layout(user, `${header("Crear solicitud", "NUEVA SOLICITUD")}
    <form id="request-form" class="request-form">
      <label>Título<input name="title" maxlength="120" required></label>
      <label>Descripción<textarea name="description" maxlength="5000" required></textarea></label>
      <label>Categoría<select name="category" required><option value="">Selecciona</option><option>Acceso</option><option>Hardware</option><option>Software</option><option>Red</option><option>Otro</option></select></label>
      <p id="form-error" class="form-error" hidden></p>
      <div class="form-actions"><a class="button button-quiet" href="/mis-solicitudes">Cancelar</a><button class="button button-primary">Enviar solicitud</button></div>
    </form>`);

  document.querySelector("#request-form").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const item = await api("/api/requests", {
        method: "POST",
        body: JSON.stringify(formData(event.currentTarget)),
      });
      location.assign(`/solicitud/${item.id}`);
    } catch (error) {
      const message = document.querySelector("#form-error");
      message.textContent = error.message;
      message.hidden = false;
    }
  };
}

async function detailPage(user, id) {
  const item = await api(`/api/requests/${id}`);
  let comments = "<p>Sin comentarios.</p>";
  if (item.comments.length > 0) {
    comments = "";
    for (const comment of item.comments) {
      comments += `<article class="comment-entry"><strong>${escapeHtml(comment.authorName)}</strong><small>${formatDate(comment.createdAt)}</small><p>${escapeHtml(comment.body)}</p></article>`;
    }
  }

  let actions = "";
  if (user.role === "soporte" && item.status === "Nuevo") actions = '<button class="button button-primary" data-next="En Proceso">Iniciar atención</button>';
  if (user.role === "soporte" && item.status === "En Proceso") actions = '<button class="button button-primary" data-next="Resuelto">Marcar resuelta</button>';
  if (user.role === "solicitante" && item.status === "Resuelto") {
    actions = '<button class="button button-quiet" id="reopen">Reabrir</button><button class="button button-primary" id="confirm">Confirmar solución</button>';
  }

  layout(user, `${header(item.title, "DETALLE", `<a class="button button-quiet" href="${roles[user.role].home}">Volver</a>`)}
    <dl class="detail-grid">
      <div class="detail-pair"><dt>Estado</dt><dd>${statusLabel(item.status)}</dd></div>
      <div class="detail-pair"><dt>Categoría</dt><dd>${escapeHtml(item.category)}</dd></div>
      <div class="detail-pair"><dt>Creada</dt><dd>${formatDate(item.createdAt)}</dd></div>
      <div class="detail-pair detail-description"><dt>Descripción</dt><dd>${escapeHtml(item.description)}</dd></div>
    </dl>
    <div class="detail-actions">${actions}</div>
    <section class="comments-section"><h2>Comentarios (${item.comments.length})</h2><div class="comment-list">${comments}</div>
      <form id="comment-form"><label>Comentario<textarea name="body" required maxlength="3000"></textarea></label><p id="comment-error" class="form-error" hidden></p><button class="button button-primary">Publicar</button></form>
    </section>`);

  document.querySelector("#comment-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const endpoint = form.dataset.reopen ? "reopen" : "comments";
    try {
      await api(`/api/requests/${id}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ body: form.body.value }),
      });
      await detailPage(user, id);
    } catch (error) {
      const message = document.querySelector("#comment-error");
      message.textContent = error.message;
      message.hidden = false;
    }
  };

  const nextButton = document.querySelector("[data-next]");
  if (nextButton) {
    nextButton.onclick = async () => {
      await api(`/api/requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextButton.dataset.next }),
      });
      await detailPage(user, id);
    };
  }
  const confirmButton = document.querySelector("#confirm");
  if (confirmButton) {
    confirmButton.onclick = async () => {
      await api(`/api/requests/${id}/confirm`, { method: "POST", body: "{}" });
      await detailPage(user, id);
    };
  }
  const reopenButton = document.querySelector("#reopen");
  if (reopenButton) {
    reopenButton.onclick = () => {
      const form = document.querySelector("#comment-form");
      form.dataset.reopen = "true";
      form.body.placeholder = "Explica por qué quieres reabrirla";
      form.body.focus();
    };
  }
}

async function start() {
  let user;
  try {
    user = await api("/api/session");
  } catch (error) {
    if (path === "/" || path === "/index.html") loginPage();
    else app.innerHTML = '<p class="access-message">Inicia sesión para continuar. <a href="/">Volver</a></p>';
    return;
  }

  if (path === "/" || path === "/index.html") {
    location.replace(roles[user.role].home);
  } else if (path === "/solicitudes/nueva") {
    newRequestPage(user);
  } else {
    const match = path.match(/^\/solicitud\/([0-9a-f-]{36})$/i);
    if (match) await detailPage(user, match[1]);
    else await listPage(user);
  }
}

start();
