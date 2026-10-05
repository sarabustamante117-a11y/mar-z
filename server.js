const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const express = require("express");

const PASSWORD = "Demo2026!";
const COOKIE = "mesa_session";
const SESSION_TIME = 8 * 60 * 60 * 1000;
const USERS = [
  { id: "requester-ana", name: "Ana Ríos", email: "ana@demo.local", role: "solicitante" },
  { id: "requester-luis", name: "Luis Vega", email: "luis@demo.local", role: "solicitante" },
  { id: "support-mateo", name: "Mateo Díaz", email: "soporte@demo.local", role: "soporte" },
];
const HOME = { solicitante: "/mis-solicitudes", soporte: "/bandeja" };
const PAGE_ROLES = {
  "/mis-solicitudes": "solicitante",
  "/solicitudes/nueva": "solicitante",
  "/bandeja": "soporte",
};

function demoUsers() {
  return USERS.map((user) => ({
    ...user,
    passwordHash: bcrypt.hashSync(PASSWORD, 10),
  }));
}

function newStore() {
  return {
    users: demoUsers(),
    requests: [],
    comments: [],
  };
}

function loadStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) return newStore();

  const store = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!store || !Array.isArray(store.requests)) {
    throw new Error("El archivo de datos no contiene solicitudes.");
  }

  store.users = demoUsers();
  store.comments = store.comments || [];
  return store;
}

function saveStore(file, store) {
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

function findUser(store, email) {
  return store.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

function canView(requestItem, user) {
  return user.role === "soporte" || requestItem.requesterId === user.id;
}

function publicRequest(requestItem, user, store) {
  const result = { ...requestItem };
  if (user.role === "soporte") {
    const owner = store.users.find((person) => person.id === requestItem.requesterId);
    result.requesterName = owner ? owner.name : "Usuario";
  }
  return result;
}

function parseSessionId(request) {
  const cookies = (request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === COOKIE) return value;
  }
  return null;
}

function createServer(options = {}) {
  const file = options.dataFile || path.join(__dirname, "data", "store.json");
  const store = loadStore(file);
  const sessions = {};
  const app = express();
  const publicFolder = path.join(__dirname, "public");
  const secureCookie = options.secureCookies === true;
  const dummyHash = bcrypt.hashSync(PASSWORD, 10);

  saveStore(file, store);
  app.use(express.json({ limit: "1mb" }));
  app.use((request, response, next) => {
    const sessionId = parseSessionId(request);
    const session = sessionId ? sessions[sessionId] : null;
    if (session && session.expires > Date.now()) {
      request.user = store.users.find((user) => user.id === session.userId);
    }
    next();
  });

  function requireRole(role) {
    return (request, response, next) => {
      if (!request.user) return response.status(401).json({ error: "Inicia sesión." });
      if (request.user.role !== role) return response.status(403).json({ error: "Sin permiso." });
      next();
    };
  }

  app.get("/app.js", (request, response) => response.sendFile(path.join(publicFolder, "app.js")));
  app.get("/styles.css", (request, response) => response.sendFile(path.join(publicFolder, "styles.css")));

  app.post("/api/login", (request, response) => {
    const email = String(request.body.email || "").trim();
    const password = String(request.body.password || "");
    const user = findUser(store, email);
    const hash = user ? user.passwordHash : dummyHash;
    if (!bcrypt.compareSync(password, hash) || !user) {
      return response.status(401).json({ error: "Credenciales inválidas." });
    }

    const sessionId = crypto.randomBytes(32).toString("hex");
    sessions[sessionId] = { userId: user.id, expires: Date.now() + SESSION_TIME };
    response.cookie(COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookie,
      maxAge: SESSION_TIME,
      path: "/",
    });
    response.json({ name: user.name, role: user.role, home: HOME[user.role] });
  });

  app.get("/api/session", (request, response) => {
    if (!request.user) return response.status(401).json({ error: "Inicia sesión." });
    response.json({ name: request.user.name, role: request.user.role });
  });

  app.post("/api/logout", (request, response) => {
    delete sessions[parseSessionId(request)];
    response.clearCookie(COOKIE, { httpOnly: true, sameSite: "strict", path: "/" });
    response.json({ ok: true });
  });

  app.get("/api/requests", (request, response) => {
    if (!request.user) return response.status(401).json({ error: "Inicia sesión." });
    const requests = store.requests
      .filter((item) => canView(item, request.user))
      .map((item) => publicRequest(item, request.user, store));
    response.json(requests);
  });

  app.post("/api/requests", requireRole("solicitante"), (request, response) => {
    const title = String(request.body.title || "").trim();
    const description = String(request.body.description || "").trim();
    const category = String(request.body.category || "").trim();
    if (!title || !description || !category) {
      return response.status(400).json({ error: "Completa título, descripción y categoría." });
    }

    const item = {
      id: crypto.randomUUID(),
      requesterId: request.user.id,
      title,
      description,
      category,
      priority: "Media",
      status: "Nuevo",
      createdAt: new Date().toISOString(),
    };
    store.requests.push(item);
    saveStore(file, store);
    response.status(201).json(item);
  });

  app.get("/api/requests/:id", (request, response) => {
    if (!request.user) return response.status(401).json({ error: "Inicia sesión." });
    const item = store.requests.find((entry) => entry.id === request.params.id);
    if (!item || !canView(item, request.user)) {
      return response.status(404).json({ error: "Solicitud no encontrada." });
    }
    const comments = store.comments.filter((comment) => comment.requestId === item.id);
    response.json({ ...publicRequest(item, request.user, store), comments });
  });

  app.patch("/api/requests/:id/status", requireRole("soporte"), (request, response) => {
    const item = store.requests.find((entry) => entry.id === request.params.id);
    if (!item) return response.status(404).json({ error: "Solicitud no encontrada." });
    const next = request.body.status;
    let allowed = "";
    if (item.status === "Nuevo") allowed = "En Proceso";
    if (item.status === "En Proceso") allowed = "Resuelto";
    if (next !== allowed) return response.status(400).json({ error: "Estado no válido." });
    item.status = next;
    saveStore(file, store);
    response.json(item);
  });

  app.post("/api/requests/:id/comments", (request, response) => {
    if (!request.user) return response.status(401).json({ error: "Inicia sesión." });
    const item = store.requests.find((entry) => entry.id === request.params.id);
    if (!item || !canView(item, request.user)) {
      return response.status(404).json({ error: "Solicitud no encontrada." });
    }
    const text = String(request.body.body || "").trim();
    if (!text) return response.status(400).json({ error: "Escribe un comentario." });
    const comment = {
      id: crypto.randomUUID(),
      requestId: item.id,
      authorName: request.user.name,
      body: text,
      createdAt: new Date().toISOString(),
    };
    store.comments.push(comment);
    saveStore(file, store);
    response.status(201).json(comment);
  });

  app.post("/api/requests/:id/confirm", requireRole("solicitante"), (request, response) => {
    const item = store.requests.find((entry) => entry.id === request.params.id && entry.requesterId === request.user.id);
    if (!item || item.status !== "Resuelto") {
      return response.status(400).json({ error: "La solicitud no está resuelta." });
    }
    item.status = "Cerrado";
    saveStore(file, store);
    response.json(item);
  });

  app.post("/api/requests/:id/reopen", requireRole("solicitante"), (request, response) => {
    const item = store.requests.find((entry) => entry.id === request.params.id && entry.requesterId === request.user.id);
    const text = String(request.body.body || "").trim();
    if (!item || item.status !== "Resuelto" || !text) {
      return response.status(400).json({ error: "Agrega un comentario para reabrir la solicitud resuelta." });
    }
    store.comments.push({
      id: crypto.randomUUID(),
      requestId: item.id,
      authorName: request.user.name,
      body: text,
      createdAt: new Date().toISOString(),
    });
    item.status = "En Proceso";
    saveStore(file, store);
    response.json(item);
  });

  app.get("/", (request, response) => response.sendFile(path.join(publicFolder, "index.html")));
  app.get("/index.html", (request, response) => response.sendFile(path.join(publicFolder, "index.html")));
  app.get("/solicitud/:id", (request, response) => {
    if (!request.user) return response.redirect("/");
    const item = store.requests.find((entry) => entry.id === request.params.id);
    if (!item || !canView(item, request.user)) return response.sendStatus(403);
    response.sendFile(path.join(publicFolder, "index.html"));
  });

  for (const route in PAGE_ROLES) {
    app.get(route, (request, response) => {
      if (!request.user) return response.redirect("/");
      if (request.user.role !== PAGE_ROLES[route]) return response.sendStatus(403);
      response.sendFile(path.join(publicFolder, "index.html"));
    });
  }

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    response.status(400).json({ error: "Solicitud incorrecta." });
  });

  return http.createServer(app);
}

function seedDatabase(file = path.join(__dirname, "data", "store.json")) {
  const store = loadStore(file);
  saveStore(file, store);
  return store.users;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, "127.0.0.1", () => console.log(`App en http://127.0.0.1:${port}`));
}

module.exports = { createServer, seedDatabase };
