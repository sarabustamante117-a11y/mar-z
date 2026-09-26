const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const PASSWORD = "Demo2026!";
const COOKIE = "mesa_session";
const SESSION_TIME = 8 * 60 * 60 * 1000;
const HOME = { solicitante: "/mis-solicitudes", coordinador: "/coordinacion", auditor: "/auditoria" };
const PAGE_ROLES = { "/mis-solicitudes": ["solicitante"], "/solicitudes/nueva": ["solicitante"], "/coordinacion": ["coordinador"], "/auditoria": ["auditor"] };
const PRIORITIES = ["Urgente", "Alta", "Media", "Baja"];
const users = [
  ["requester-ana", "Ana Ríos", "ana@demo.local", "solicitante"],
  ["requester-luis", "Luis Vega", "luis@demo.local", "solicitante"],
  ["coordinator-clara", "Clara Solís", "coordinacion@demo.local", "coordinador"],
  ["auditor-inés", "Inés Mora", "auditoria@demo.local", "auditor"],
].map(([id, name, email, role]) => { const salt = crypto.randomBytes(16); return { id, name, email, role, salt, passwordHash: crypto.scryptSync(PASSWORD, salt, 64) }; });
const userByEmail = new Map(users.map((user) => [user.email, user]));
const dummySalt = crypto.randomBytes(16);
const dummyHash = crypto.scryptSync(PASSWORD, dummySalt, 64);

function sampleStore() {
  const now = Date.now();
  const samples = [
    ["requester-ana", "No puedo acceder al portal", "Acceso", "Urgente", "Nuevo", 1],
    ["requester-ana", "Instalar editor de documentos", "Software", "Media", "En curso", 3],
    ["requester-luis", "Teclado de recepción no responde", "Hardware", "Alta", "Nuevo", 2],
    ["requester-luis", "Conexión intermitente en sala 4", "Red", "Baja", "Resuelta", 6],
  ];
  return { requests: samples.map(([requesterId, title, category, priority, status, days]) => ({
    id: crypto.randomUUID(), requesterId, title,
    description: `${title}. Solicitud de demostración para revisar el flujo de atención.`,
    category, priority, status,
    createdAt: new Date(now - days * 86400000).toISOString(),
  })) };
}

function loadStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) { const store = sampleStore(); fs.writeFileSync(file, JSON.stringify(store, null, 2)); return store; }
  const store = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!store || !Array.isArray(store.requests)) throw Error("El archivo de datos debe incluir una lista de solicitudes.");
  return store;
}
function saveStore(file, store) { fs.writeFileSync(`${file}.tmp`, JSON.stringify(store, null, 2)); fs.renameSync(`${file}.tmp`, file); }
function reply(response, code, data, type = "application/json; charset=utf-8", headers = {}) {
  response.writeHead(code, { "Content-Type": type, ...headers });
  response.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
const fail = (response, code, message) => reply(response, code, { error: message });
async function readJson(request) {
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > 1e6) throw Object.assign(Error("El cuerpo de la solicitud es demasiado grande."), { statusCode: 413 }); }
  try { return body ? JSON.parse(body) : {}; } catch { throw Object.assign(Error("El cuerpo de la solicitud no es JSON válido."), { statusCode: 400 }); }
}
function cookie(request) { const value = request.headers.cookie || ""; const found = value.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`)); return found?.slice(COOKIE.length + 1) || null; }
function publicRequest(item, viewer) {
  const result = { ...item };
  if (viewer.role !== "solicitante") { const owner = users.find((user) => user.id === item.requesterId); result.requesterName = owner?.name || "Usuario"; result.requesterEmail = owner?.email || ""; }
  return result;
}
function deniedPage() { return "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>Acceso no autorizado</title><h1>Acceso no autorizado</h1><p>Tu cuenta no tiene permiso para abrir esta página.</p><a href=\"/\">Volver al inicio</a>"; }

function createServer(options = {}) {
  const file = options.dataFile || path.join(__dirname, "data", "store.json");
  const store = loadStore(file), sessions = new Map(), root = path.join(__dirname, "public");
  const staticFiles = { "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/styles.css": ["styles.css", "text/css; charset=utf-8"] };
  const currentUser = (request) => { const id = cookie(request), session = id && sessions.get(id); if (!session || session.expires <= Date.now()) { if (id) sessions.delete(id); return null; } return users.find((user) => user.id === session.userId) || null; };
  const allowed = (user, roles) => user && roles.includes(user.role);
  const findRequest = (id, user) => { const item = store.requests.find((request) => request.id === id); return item && (user.role !== "solicitante" || item.requesterId === user.id) ? item : null; };
  const protect = (response, user, roles) => allowed(user, roles) || (fail(response, 403, "Acceso no autorizado."), false);
  const page = (response, status, html) => reply(response, status, html, "text/html; charset=utf-8");

  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("Referrer-Policy", "no-referrer"); response.setHeader("Cache-Control", "no-store");
    try {
      const url = new URL(request.url, "http://localhost"), user = currentUser(request);
      if (request.method === "GET" && staticFiles[url.pathname]) { const [name, type] = staticFiles[url.pathname]; return reply(response, 200, fs.readFileSync(path.join(root, name)), type); }
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname === "/api/login" && request.method === "POST") {
          const input = await readJson(request), email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "", password = typeof input.password === "string" ? input.password : "";
          const match = userByEmail.get(email), hash = crypto.scryptSync(password, match?.salt || dummySalt, 64);
          if (!match || !crypto.timingSafeEqual(hash, match.passwordHash || dummyHash)) return fail(response, 401, "Credenciales inválidas.");
          const id = crypto.randomBytes(32).toString("hex"); sessions.set(id, { userId: match.id, expires: Date.now() + SESSION_TIME });
          return reply(response, 200, { user: { id: match.id, name: match.name, email: match.email, role: match.role }, home: HOME[match.role] }, "application/json; charset=utf-8", { "Set-Cookie": `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TIME / 1000}` });
        }
        if (!user) return fail(response, 401, "Debes iniciar sesión.");
        if (url.pathname === "/api/session" && request.method === "GET") return reply(response, 200, { id: user.id, name: user.name, email: user.email, role: user.role });
        if (url.pathname === "/api/logout" && request.method === "POST") { sessions.delete(cookie(request)); return reply(response, 200, { ok: true }, "application/json; charset=utf-8", { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` }); }
        if (url.pathname === "/api/requests" && request.method === "GET") { if (!protect(response, user, Object.keys(HOME))) return; return reply(response, 200, store.requests.filter((item) => user.role !== "solicitante" || item.requesterId === user.id).map((item) => publicRequest(item, user))); }
        if (url.pathname === "/api/requests" && request.method === "POST") {
          if (!protect(response, user, ["solicitante"])) return;
          const input = await readJson(request), fields = ["title", "description", "category"].map((key) => typeof input[key] === "string" ? input[key].trim() : "");
          if (fields.some((value) => !value)) return fail(response, 400, "Título, descripción y categoría son obligatorios.");
          if (fields[0].length > 120 || fields[1].length > 5000 || fields[2].length > 60) return fail(response, 400, "Uno o más campos superan la longitud permitida.");
          const [title, description, category] = fields, item = { id: crypto.randomUUID(), requesterId: user.id, title, description, category, priority: "Media", status: "Nuevo", createdAt: new Date().toISOString() };
          store.requests.push(item); saveStore(file, store); return reply(response, 201, publicRequest(item, user));
        }
        let match = url.pathname.match(/^\/api\/requests\/([0-9a-f-]{36})\/priority$/i);
        if (match && request.method === "PATCH") { if (!protect(response, user, ["coordinador"])) return; const item = store.requests.find((request) => request.id === match[1]); if (!item) return fail(response, 404, "Solicitud no encontrada."); const input = await readJson(request); if (!PRIORITIES.includes(input.priority)) return fail(response, 400, "La prioridad no es válida."); item.priority = input.priority; item.updatedAt = new Date().toISOString(); saveStore(file, store); return reply(response, 200, publicRequest(item, user)); }
        match = url.pathname.match(/^\/api\/requests\/([0-9a-f-]{36})$/i);
        if (match && request.method === "GET") { const item = findRequest(match[1], user); return item ? reply(response, 200, publicRequest(item, user)) : fail(response, 404, "Solicitud no encontrada."); }
        return fail(response, 404, "Recurso no encontrado.");
      }
      if (request.method !== "GET") return reply(response, 405, "Método no permitido.", "text/plain; charset=utf-8");
      if (url.pathname === "/" || url.pathname === "/index.html") return page(response, 200, fs.readFileSync(path.join(root, "index.html")));
      const detail = url.pathname.match(/^\/solicitud\/([0-9a-f-]{36})$/i), rolesForPage = detail ? Object.keys(HOME) : PAGE_ROLES[url.pathname];
      if (!rolesForPage) return reply(response, 404, "Página no encontrada.", "text/plain; charset=utf-8");
      if (!user) return reply(response, 302, "", "text/plain; charset=utf-8", { Location: "/?denied=1" });
      if (!allowed(user, rolesForPage) || (detail && !findRequest(detail[1], user))) return page(response, 403, deniedPage());
      return page(response, 200, fs.readFileSync(path.join(root, "index.html")));
    } catch (error) { if (!response.headersSent) fail(response, error.statusCode || 500, error.statusCode ? error.message : "Ocurrió un error interno."); else response.destroy(); }
  });
}

if (require.main === module) { const host = process.env.HOST || "127.0.0.1", port = Number(process.env.PORT || 3000); createServer().listen(port, host, () => console.log(`Mesa de solicitudes disponible en http://${host}:${port}`)); }
module.exports = { createServer };
