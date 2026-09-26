const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const SESSION_COOKIE = "mesa_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const PASSWORD = "Demo2026!";
const ROLE_HOME = {
  solicitante: "/mis-solicitudes",
  coordinador: "/coordinacion",
  auditor: "/auditoria",
};
const PRIORITIES = ["Urgente", "Alta", "Media", "Baja"];
const PRIORITY_RANK = { Urgente: 4, Alta: 3, Media: 2, Baja: 1 };

const users = [
  { id: "requester-ana", name: "Ana Ríos", email: "ana@demo.local", role: "solicitante" },
  { id: "requester-luis", name: "Luis Vega", email: "luis@demo.local", role: "solicitante" },
  { id: "coordinator-clara", name: "Clara Solís", email: "coordinacion@demo.local", role: "coordinador" },
  { id: "auditor-inés", name: "Inés Mora", email: "auditoria@demo.local", role: "auditor" },
].map((user) => {
  const salt = crypto.randomBytes(16);
  return { ...user, salt, passwordHash: crypto.scryptSync(PASSWORD, salt, 64) };
});

const userByEmail = new Map(users.map((user) => [user.email, user]));
const dummySalt = crypto.randomBytes(16);
const dummyPasswordHash = crypto.scryptSync(PASSWORD, dummySalt, 64);

function createInitialStore() {
  const now = Date.now();
  const sampleRequests = [
    ["requester-ana", "No puedo acceder al portal", "Acceso", "Urgente", "Nuevo", 1],
    ["requester-ana", "Instalar editor de documentos", "Software", "Media", "En curso", 3],
    ["requester-luis", "Teclado de recepción no responde", "Hardware", "Alta", "Nuevo", 2],
    ["requester-luis", "Conexión intermitente en sala 4", "Red", "Baja", "Resuelta", 6],
  ].map(([requesterId, title, category, priority, status, daysAgo]) => ({
    id: crypto.randomUUID(),
    requesterId,
    title,
    description: `${title}. Solicitud de demostración para revisar el flujo de atención.`,
    category,
    priority,
    status,
    createdAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  }));

  return { requests: sampleRequests };
}

function loadStore(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    const initialStore = createInitialStore();
    fs.writeFileSync(filePath, JSON.stringify(initialStore, null, 2), "utf8");
    return initialStore;
  }

  const store = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!store || !Array.isArray(store.requests)) {
    throw new Error("El archivo de datos debe incluir una lista de solicitudes.");
  }
  return store;
}

function saveStore(filePath, store) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(Object.assign(new Error("El cuerpo de la solicitud es demasiado grande."), { statusCode: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error("El cuerpo de la solicitud no es JSON válido."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function cookieValue(request, name) {
  const cookieHeader = request.headers.cookie || "";
  const match = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function serializeRequest(request, viewer) {
  const requester = users.find((user) => user.id === request.requesterId);
  const result = { ...request };
  if (viewer.role !== "solicitante") {
    result.requesterName = requester?.name || "Usuario";
    result.requesterEmail = requester?.email || "";
  }
  return result;
}

function accessDeniedPage() {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso no autorizado</title><body style="font:16px system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:2rem;color:#183d31"><h1>Acceso no autorizado</h1><p>Tu cuenta no tiene permiso para abrir esta página.</p><a href="/">Volver al inicio de sesión</a></body></html>`;
}

function createServer(options = {}) {
  const dataFile = options.dataFile || path.join(__dirname, "data", "store.json");
  const store = loadStore(dataFile);
  const sessions = new Map();
  const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"));
  const publicFiles = {
    "/app.js": [path.join(__dirname, "public", "app.js"), "text/javascript; charset=utf-8"],
    "/styles.css": [path.join(__dirname, "public", "styles.css"), "text/css; charset=utf-8"],
  };

  function getSessionUser(request) {
    const sessionId = cookieValue(request, SESSION_COOKIE);
    const session = sessionId ? sessions.get(sessionId) : null;
    if (!session || session.expiresAt <= Date.now()) {
      if (sessionId) sessions.delete(sessionId);
      return null;
    }
    return users.find((user) => user.id === session.userId) || null;
  }

  function getRequestForUser(requestId, user) {
    const requested = store.requests.find((item) => item.id === requestId);
    if (!requested) return null;
    if (user.role === "solicitante" && requested.requesterId !== user.id) return null;
    return requested;
  }

  function requireRole(user, allowedRoles) {
    return user && allowedRoles.includes(user.role);
  }

  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");

    try {
      const url = new URL(request.url, "http://localhost");
      const user = getSessionUser(request);

      if (request.method === "GET" && publicFiles[url.pathname]) {
        const [filePath, contentType] = publicFiles[url.pathname];
        response.writeHead(200, { "Content-Type": contentType });
        response.end(fs.readFileSync(filePath));
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/login" && request.method === "POST") {
          const credentials = await readJson(request);
          const email = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
          const password = typeof credentials.password === "string" ? credentials.password : "";
          const matchedUser = userByEmail.get(email);
          const salt = matchedUser?.salt || dummySalt;
          const expectedHash = matchedUser?.passwordHash || dummyPasswordHash;
          const submittedHash = crypto.scryptSync(password, salt, 64);
          const validPassword = crypto.timingSafeEqual(submittedHash, expectedHash);

          if (!matchedUser || !validPassword) {
            sendJson(response, 401, { error: "Credenciales inválidas." });
            return;
          }

          const sessionId = crypto.randomBytes(32).toString("hex");
          sessions.set(sessionId, { userId: matchedUser.id, expiresAt: Date.now() + SESSION_DURATION_MS });
          sendJson(response, 200, {
            user: { id: matchedUser.id, name: matchedUser.name, email: matchedUser.email, role: matchedUser.role },
            home: ROLE_HOME[matchedUser.role],
          }, {
            "Set-Cookie": `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}`,
          });
          return;
        }

        if (!user) {
          sendJson(response, 401, { error: "Debes iniciar sesión." });
          return;
        }

        if (url.pathname === "/api/session" && request.method === "GET") {
          sendJson(response, 200, { id: user.id, name: user.name, email: user.email, role: user.role });
          return;
        }

        if (url.pathname === "/api/logout" && request.method === "POST") {
          const sessionId = cookieValue(request, SESSION_COOKIE);
          if (sessionId) sessions.delete(sessionId);
          sendJson(response, 200, { ok: true }, {
            "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
          });
          return;
        }

        if (url.pathname === "/api/requests" && request.method === "GET") {
          if (!requireRole(user, ["solicitante", "coordinador", "auditor"])) {
            sendJson(response, 403, { error: "Acceso no autorizado." });
            return;
          }
          const visibleRequests = store.requests.filter((item) => (
            user.role !== "solicitante" || item.requesterId === user.id
          ));
          sendJson(response, 200, visibleRequests.map((item) => serializeRequest(item, user)));
          return;
        }

        if (url.pathname === "/api/requests" && request.method === "POST") {
          if (!requireRole(user, ["solicitante"])) {
            sendJson(response, 403, { error: "Acceso no autorizado." });
            return;
          }
          const input = await readJson(request);
          const title = typeof input.title === "string" ? input.title.trim() : "";
          const description = typeof input.description === "string" ? input.description.trim() : "";
          const category = typeof input.category === "string" ? input.category.trim() : "";
          if (!title || !description || !category) {
            sendJson(response, 400, { error: "Título, descripción y categoría son obligatorios." });
            return;
          }
          if (title.length > 120 || description.length > 5000 || category.length > 60) {
            sendJson(response, 400, { error: "Uno o más campos superan la longitud permitida." });
            return;
          }

          const createdRequest = {
            id: crypto.randomUUID(),
            requesterId: user.id,
            title,
            description,
            category,
            priority: "Media",
            status: "Nuevo",
            createdAt: new Date().toISOString(),
          };
          store.requests.push(createdRequest);
          saveStore(dataFile, store);
          sendJson(response, 201, serializeRequest(createdRequest, user));
          return;
        }

        const priorityMatch = url.pathname.match(/^\/api\/requests\/([0-9a-f-]{36})\/priority$/i);
        if (priorityMatch && request.method === "PATCH") {
          if (!requireRole(user, ["coordinador"])) {
            sendJson(response, 403, { error: "Acceso no autorizado." });
            return;
          }
          const targetRequest = store.requests.find((item) => item.id === priorityMatch[1]);
          if (!targetRequest) {
            sendJson(response, 404, { error: "Solicitud no encontrada." });
            return;
          }
          const input = await readJson(request);
          if (!PRIORITIES.includes(input.priority)) {
            sendJson(response, 400, { error: "La prioridad no es válida." });
            return;
          }
          targetRequest.priority = input.priority;
          targetRequest.updatedAt = new Date().toISOString();
          saveStore(dataFile, store);
          sendJson(response, 200, serializeRequest(targetRequest, user));
          return;
        }

        const detailMatch = url.pathname.match(/^\/api\/requests\/([0-9a-f-]{36})$/i);
        if (detailMatch && request.method === "GET") {
          const targetRequest = getRequestForUser(detailMatch[1], user);
          if (!targetRequest) {
            sendJson(response, 404, { error: "Solicitud no encontrada." });
            return;
          }
          sendJson(response, 200, serializeRequest(targetRequest, user));
          return;
        }

        sendJson(response, 404, { error: "Recurso no encontrado." });
        return;
      }

      if (request.method !== "GET") {
        response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Método no permitido.");
        return;
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(indexHtml);
        return;
      }

      const detailPageMatch = url.pathname.match(/^\/solicitud\/([0-9a-f-]{36})$/i);
      const pageRoles = {
        "/mis-solicitudes": ["solicitante"],
        "/solicitudes/nueva": ["solicitante"],
        "/coordinacion": ["coordinador"],
        "/auditoria": ["auditor"],
      };
      const allowedRoles = detailPageMatch ? ["solicitante", "coordinador", "auditor"] : pageRoles[url.pathname];
      if (!allowedRoles) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Página no encontrada.");
        return;
      }
      if (!user) {
        response.writeHead(302, { Location: "/?denied=1" });
        response.end();
        return;
      }
      if (!requireRole(user, allowedRoles)) {
        response.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
        response.end(accessDeniedPage());
        return;
      }
      if (detailPageMatch && !getRequestForUser(detailPageMatch[1], user)) {
        response.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
        response.end(accessDeniedPage());
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(indexHtml);
    } catch (error) {
      if (!response.headersSent) {
        sendJson(response, error.statusCode || 500, {
          error: error.statusCode ? error.message : "Ocurrió un error interno.",
        });
      } else {
        response.destroy();
      }
    }
  });

  return server;
}

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () => {
    console.log(`Mesa de solicitudes disponible en http://${host}:${port}`);
  });
}

module.exports = { createServer };