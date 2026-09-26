const app = document.querySelector("#app");
const pathName = window.location.pathname;
const roleHome = {
  solicitante: "/mis-solicitudes",
  coordinador: "/coordinacion",
  auditor: "/auditoria",
};
const roleLabels = {
  solicitante: "Solicitante",
  coordinador: "Agente coordinador",
  auditor: "Auditor",
};
const priorityRank = { Urgente: 4, Alta: 3, Media: 2, Baja: 1 };
const statusRank = { Nuevo: 1, "En curso": 2, Resuelta: 3 };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(payload.error || "No se pudo completar la operación."), {
      status: response.status,
    });
  }
  return payload;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderLogin() {
  const denied = new URLSearchParams(window.location.search).has("denied");
  app.innerHTML = `
    <div class="login-layout">
      <section class="login-intro" aria-labelledby="login-title">
        <a class="wordmark" href="/" aria-label="Mesa de solicitudes, inicio">
          <span class="wordmark-symbol" aria-hidden="true">M</span>
          <span>Mesa<span class="wordmark-light"> / solicitudes</span></span>
        </a>
        <div class="intro-copy">
          <p class="eyebrow">SERVICIO INTERNO · 01</p>
          <h1 id="login-title">Las cosas<br>empiezan por<br><span>escuchar.</span></h1>
          <p class="intro-description">Un solo lugar para pedir ayuda, ordenar el trabajo y dar seguimiento.</p>
        </div>
        <div class="role-list" aria-label="Perfiles de acceso">
          <div class="role-item"><span class="role-number">01</span><div><strong>Solicitante</strong><span>Crea y consulta sus solicitudes</span></div></div>
          <div class="role-item"><span class="role-number">02</span><div><strong>Agente coordinador</strong><span>Prioriza y organiza el trabajo</span></div></div>
          <div class="role-item"><span class="role-number">03</span><div><strong>Auditor</strong><span>Consulta el registro completo</span></div></div>
        </div>
        <p class="intro-foot">ACCESO PERSONAL · DATOS AISLADOS POR CUENTA</p>
      </section>
      <section class="login-panel" aria-labelledby="form-title">
        <div class="login-form-wrap">
          <p class="eyebrow eyebrow-muted">BIENVENIDO DE NUEVO</p>
          <h2 id="form-title">Iniciar sesión</h2>
          <p class="form-lede">Ingresa con tu cuenta para continuar.</p>
          ${denied ? '<p class="notice notice-warning" role="status">No tienes permiso para abrir esa página. Inicia sesión con el rol autorizado.</p>' : ""}
          <form id="login-form" class="form-stack">
            <label for="email">Correo electrónico</label>
            <input id="email" name="email" type="email" autocomplete="username" placeholder="nombre@empresa.com" required>
            <label for="password">Contraseña</label>
            <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Tu contraseña" required>
            <p id="login-error" class="form-error" role="alert" hidden></p>
            <button class="button button-primary button-wide" type="submit">Entrar <span aria-hidden="true">→</span></button>
          </form>
          <p class="login-footnote">Las cuentas de demostración están disponibles en el archivo README.</p>
        </div>
        <span class="panel-index" aria-hidden="true">M / 2026</span>
      </section>
    </div>`;

  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    const errorElement = document.querySelector("#login-error");
    button.disabled = true;
    button.textContent = "Comprobando...";
    errorElement.hidden = true;
    try {
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.elements.email.value,
          password: form.elements.password.value,
        }),
      });
      window.location.assign(result.home);
    } catch (error) {
      errorElement.textContent = error.status === 401
        ? "Credenciales inválidas."
        : "No se pudo iniciar sesión. Inténtalo de nuevo.";
      errorElement.hidden = false;
      button.disabled = false;
      button.innerHTML = 'Entrar <span aria-hidden="true">→</span>';
    }
  });
}

function navigationFor(user) {
  if (user.role === "solicitante") {
    return [
      ["/mis-solicitudes", "Mis solicitudes", "01"],
      ["/solicitudes/nueva", "Crear solicitud", "02"],
    ];
  }
  if (user.role === "coordinador") return [["/coordinacion", "Bandeja de trabajo", "01"]];
  return [["/auditoria", "Registro de solicitudes", "01"]];
}

function renderFrame(user, activePath, content) {
  const links = navigationFor(user).map(([href, label, number]) => `
    <a class="nav-link ${activePath === href ? "is-active" : ""}" href="${href}">
      <span class="nav-number">${number}</span><span>${label}</span>
    </a>`).join("");

  app.innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <a class="wordmark wordmark-sidebar" href="${roleHome[user.role]}" aria-label="Mesa de solicitudes, inicio">
          <span class="wordmark-symbol" aria-hidden="true">M</span>
          <span>Mesa<span class="wordmark-light"> / solicitudes</span></span>
        </a>
        <div class="sidebar-section-label">ESPACIO DE TRABAJO</div>
        <nav class="main-nav" aria-label="Navegación principal">${links}</nav>
        <div class="sidebar-bottom">
          <div class="account-summary">
            <span class="avatar" aria-hidden="true">${escapeHtml(user.name.split(" ").map((part) => part[0]).slice(0, 2).join(""))}</span>
            <span class="account-copy"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(roleLabels[user.role])}</span></span>
          </div>
          <button id="logout-button" class="logout-button" type="button">Cerrar sesión <span aria-hidden="true">↗</span></button>
        </div>
      </aside>
      <main class="workspace"><div class="workspace-inner">${content}</div></main>
    </div>`;

  document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  });
}

function statusMarkup(status) {
  const style = status === "Resuelta" ? "status-done" : status === "En curso" ? "status-progress" : "status-new";
  return `<span class="status-label ${style}"><span aria-hidden="true"></span>${escapeHtml(status)}</span>`;
}

function requestTable(requests, options = {}) {
  const { coordinator = false, showRequester = false } = options;
  if (requests.length === 0) {
    return '<div class="empty-state"><span class="empty-mark" aria-hidden="true">—</span><h3>Aún no hay solicitudes</h3><p>Cuando se registre una, aparecerá aquí.</p></div>';
  }

  const rows = requests.map((request) => `
    <tr>
      <td><a class="request-title" href="/solicitud/${escapeHtml(request.id)}">${escapeHtml(request.title)}</a><span class="request-category">${escapeHtml(request.category)} · ${escapeHtml(request.id.slice(0, 8))}</span></td>
      ${showRequester ? `<td><span>${escapeHtml(request.requesterName)}</span><span class="request-category">${escapeHtml(request.requesterEmail)}</span></td>` : ""}
      <td>${coordinator
        ? `<label class="visually-hidden" for="priority-${escapeHtml(request.id)}">Cambiar prioridad de ${escapeHtml(request.title)}</label><select id="priority-${escapeHtml(request.id)}" class="priority-select" data-priority-id="${escapeHtml(request.id)}">${["Urgente", "Alta", "Media", "Baja"].map((priority) => `<option value="${priority}" ${request.priority === priority ? "selected" : ""}>${priority}</option>`).join("")}</select>`
        : `<span class="priority-label priority-${request.priority.toLowerCase()}"><span aria-hidden="true"></span>${escapeHtml(request.priority)}</span>`}</td>
      <td>${statusMarkup(request.status)}</td>
      <td class="date-cell">${escapeHtml(formatDate(request.createdAt))}</td>
    </tr>`).join("");

  return `<div class="table-scroll"><table class="request-table"><thead><tr><th scope="col">Solicitud</th>${showRequester ? '<th scope="col">Solicitante</th>' : ""}<th scope="col">Prioridad</th><th scope="col">Estado</th><th scope="col">Fecha</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function renderRequesterList(user) {
  const requests = await api("/api/requests");
  const content = `
    <header class="page-header">
      <div><p class="eyebrow eyebrow-muted">TU ESPACIO</p><h1>Mis solicitudes</h1><p class="page-lede">Consulta el estado y seguimiento de tus solicitudes.</p></div>
      <a class="button button-primary" href="/solicitudes/nueva">Nueva solicitud <span aria-hidden="true">+</span></a>
    </header>
    <div class="section-heading"><h2>Solicitudes registradas</h2><span class="record-count">${requests.length} ${requests.length === 1 ? "registro" : "registros"}</span></div>
    ${requestTable(requests)}`;
  renderFrame(user, pathName, content);
}

function renderNewRequest(user) {
  const content = `
    <header class="page-header page-header-simple"><div><p class="eyebrow eyebrow-muted">NUEVO REGISTRO</p><h1>Crear solicitud</h1><p class="page-lede">Completa los campos para agregar una solicitud a la mesa.</p></div></header>
    <section class="request-form-section">
      <form id="request-form" class="request-form">
        <label for="title">Título <span aria-hidden="true">*</span></label>
        <input id="title" name="title" maxlength="120" placeholder="Resume lo que necesitas" required>
        <label for="description">Descripción <span aria-hidden="true">*</span></label>
        <textarea id="description" name="description" rows="6" maxlength="5000" placeholder="Añade el contexto y los detalles relevantes" required></textarea>
        <label for="category">Categoría <span aria-hidden="true">*</span></label>
        <select id="category" name="category" required>
          <option value="" selected disabled>Selecciona una categoría</option>
          <option>Acceso</option><option>Hardware</option><option>Software</option><option>Red</option><option>Otro</option>
        </select>
        <p id="request-error" class="form-error" role="alert" hidden></p>
        <div class="form-actions"><a class="button button-quiet" href="/mis-solicitudes">Cancelar</a><button class="button button-primary" type="submit">Enviar solicitud <span aria-hidden="true">→</span></button></div>
      </form>
    </section>`;
  renderFrame(user, pathName, content);

  document.querySelector("#request-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const errorElement = document.querySelector("#request-error");
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const createdRequest = await api("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          title: form.elements.title.value,
          description: form.elements.description.value,
          category: form.elements.category.value,
        }),
      });
      window.location.assign(`/solicitud/${createdRequest.id}`);
    } catch (error) {
      errorElement.textContent = error.message;
      errorElement.hidden = false;
      button.disabled = false;
    }
  });
}

function renderCoordinator(user, requests, sortBy = "priority", direction = "desc") {
  const sortedRequests = [...requests].sort((left, right) => {
    let comparison = 0;
    if (sortBy === "priority") comparison = priorityRank[left.priority] - priorityRank[right.priority];
    if (sortBy === "status") comparison = (statusRank[left.status] || 0) - (statusRank[right.status] || 0);
    if (sortBy === "date") comparison = new Date(left.createdAt) - new Date(right.createdAt);
    return (comparison || left.title.localeCompare(right.title, "es")) * (direction === "asc" ? 1 : -1);
  });
  const content = `
    <header class="page-header">
      <div><p class="eyebrow eyebrow-muted">COORDINACIÓN · BANDEJA</p><h1>Trabajo por ordenar</h1><p class="page-lede">Ajusta prioridades y organiza las solicitudes del equipo.</p></div>
      <span class="total-indicator"><span class="live-dot" aria-hidden="true"></span>${requests.length} solicitudes</span>
    </header>
    <section class="sorting-bar" aria-label="Opciones de ordenamiento">
      <label for="sort-by">Ordenar por</label>
      <select id="sort-by"><option value="priority" ${sortBy === "priority" ? "selected" : ""}>Prioridad</option><option value="status" ${sortBy === "status" ? "selected" : ""}>Estado</option><option value="date" ${sortBy === "date" ? "selected" : ""}>Fecha</option></select>
      <button id="sort-direction" class="button button-quiet sort-direction" type="button" aria-label="Cambiar sentido de orden">${direction === "desc" ? "Más alto / reciente primero ↓" : "Más bajo / antiguo primero ↑"}</button>
    </section>
    <div id="priority-error" class="form-error" role="alert" hidden></div>
    ${requestTable(sortedRequests, { coordinator: true, showRequester: true })}`;
  renderFrame(user, pathName, content);

  document.querySelector("#sort-by").addEventListener("change", (event) => {
    renderCoordinator(user, requests, event.target.value, direction);
  });
  document.querySelector("#sort-direction").addEventListener("click", () => {
    renderCoordinator(user, requests, sortBy, direction === "desc" ? "asc" : "desc");
  });
  document.querySelectorAll("[data-priority-id]").forEach((select) => {
    select.addEventListener("change", async (event) => {
      const priority = event.currentTarget.value;
      const requestId = event.currentTarget.dataset.priorityId;
      event.currentTarget.disabled = true;
      try {
        const updatedRequest = await api(`/api/requests/${requestId}/priority`, {
          method: "PATCH",
          body: JSON.stringify({ priority }),
        });
        const index = requests.findIndex((item) => item.id === updatedRequest.id);
        requests[index] = updatedRequest;
        renderCoordinator(user, requests, sortBy, direction);
      } catch (error) {
        const errorElement = document.querySelector("#priority-error");
        errorElement.textContent = error.message;
        errorElement.hidden = false;
        event.currentTarget.disabled = false;
      }
    });
  });
}

async function renderAuditor(user) {
  const requests = await api("/api/requests");
  const content = `
    <header class="page-header">
      <div><p class="eyebrow eyebrow-muted">AUDITORÍA · SOLO LECTURA</p><h1>Registro de solicitudes</h1><p class="page-lede">Vista completa del registro, sin controles de edición.</p></div>
      <span class="total-indicator">${requests.length} registros</span>
    </header>
    ${requestTable(requests, { showRequester: true })}`;
  renderFrame(user, pathName, content);
}

async function renderDetail(user, requestId) {
  const request = await api(`/api/requests/${requestId}`);
  const requesterDetails = user.role === "solicitante"
    ? ""
    : `<div class="detail-pair"><dt>Solicitante</dt><dd>${escapeHtml(request.requesterName)} <span>${escapeHtml(request.requesterEmail)}</span></dd></div>`;
  const content = `
    <header class="page-header page-header-simple">
      <div><p class="eyebrow eyebrow-muted">DETALLE · ${escapeHtml(request.id.slice(0, 8))}</p><h1>${escapeHtml(request.title)}</h1><p class="page-lede">Creada el ${escapeHtml(formatDate(request.createdAt))}</p></div>
      <a class="button button-quiet" href="${roleHome[user.role]}">← Volver</a>
    </header>
    <section class="detail-section" aria-label="Información de la solicitud">
      <dl class="detail-grid">
        <div class="detail-pair"><dt>Estado</dt><dd>${statusMarkup(request.status)}</dd></div>
        <div class="detail-pair"><dt>Prioridad</dt><dd><span class="priority-label priority-${request.priority.toLowerCase()}"><span aria-hidden="true"></span>${escapeHtml(request.priority)}</span></dd></div>
        <div class="detail-pair"><dt>Categoría</dt><dd>${escapeHtml(request.category)}</dd></div>
        ${requesterDetails}
        <div class="detail-pair detail-description"><dt>Descripción</dt><dd>${escapeHtml(request.description).replace(/\n/g, "<br>")}</dd></div>
      </dl>
    </section>`;
  renderFrame(user, roleHome[user.role], content);
}

async function initialize() {
  let user;
  try {
    user = await api("/api/session");
  } catch {
    if (pathName === "/" || pathName === "/index.html") renderLogin();
    else app.innerHTML = '<p class="access-message">No tienes permiso para abrir esta página. <a href="/">Volver al inicio de sesión</a>.</p>';
    return;
  }

  if (pathName === "/" || pathName === "/index.html") {
    window.location.replace(roleHome[user.role]);
    return;
  }

  try {
    if (pathName === "/mis-solicitudes" && user.role === "solicitante") return await renderRequesterList(user);
    if (pathName === "/solicitudes/nueva" && user.role === "solicitante") return renderNewRequest(user);
    if (pathName === "/coordinacion" && user.role === "coordinador") {
      return renderCoordinator(user, await api("/api/requests"));
    }
    if (pathName === "/auditoria" && user.role === "auditor") return await renderAuditor(user);
    const detailMatch = pathName.match(/^\/solicitud\/([0-9a-f-]{36})$/i);
    if (detailMatch) return await renderDetail(user, detailMatch[1]);
    app.innerHTML = '<p class="access-message">No tienes permiso para abrir esta página. <a href="/">Volver al inicio de sesión</a>.</p>';
  } catch (error) {
    if (error.status === 401) {
      window.location.replace("/");
      return;
    }
    app.innerHTML = `<p class="access-message">${escapeHtml(error.message)} <a href="${roleHome[user.role]}">Volver a tu espacio</a>.</p>`;
  }
}

initialize();