# Mesa de soporte

MVP local de solicitudes de soporte con Node.js, Express y JSON. Requiere Node.js 20 o posterior.

## Ejecutar

```sh
npm install
npm run seed
npm start
```

Abre http://127.0.0.1:3000. Los datos se guardan en `data/store.json`.

## Usuarios demo

La contraseña de todas las cuentas es `Demo2026!`.

| Rol | Correo |
| --- | --- |
| Solicitante | `ana@demo.local` |
| Solicitante | `luis@demo.local` |
| Soporte | `soporte@demo.local` |

## Incluye

- Login con contraseñas bcrypt y cierre de sesión.
- Solicitantes crean solicitudes y solo ven las propias.
- Soporte ve las solicitudes, comenta y cambia su estado.
- El solicitante puede confirmar una solución o reabrirla con un comentario.
- Los comentarios se agregan al historial y no se editan ni eliminan.

Este MVP no incluye auditoría, asignación, edición de prioridad, filtros, métricas ni exportación.

## Pruebas

```sh
npm test
```
