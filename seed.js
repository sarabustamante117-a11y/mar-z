const { seedDatabase } = require("./server");

const users = seedDatabase();
console.log(`Datos semilla listos: ${users.length} usuarios y sus contraseñas bcrypt en data/store.json.`);
console.log("Contraseña demo para todas las cuentas: Demo2026!");
