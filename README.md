# Mesa de solicitudes

Aplicación local ligera para crear y consultar solicitudes con autorización por rol. Requiere Node.js 20 o posterior; no necesita instalar dependencias.

## Iniciar

```sh
npm start
```

Abre http://127.0.0.1:3000. Las solicitudes se guardan en `data/store.json` y se conservan al reiniciar el servidor.

## Cuentas de demostración

Todas las cuentas usan la contraseña `Demo2026!`.

| Rol | Correo |
| --- | --- |
| Solicitante Ana | `ana@demo.local` |
| Solicitante Luis | `luis@demo.local` |
| Agente coordinador | `coordinacion@demo.local` |
| Auditor | `auditoria@demo.local` |

Los solicitantes solo pueden crear solicitudes y consultar las propias. El coordinador puede consultar todas, cambiar prioridades y ordenar la bandeja por prioridad, estado o fecha. El auditor puede consultar el registro completo en modo de solo lectura. Los intentos de acceso directo a páginas ajenas al rol se bloquean en el servidor.

## Pruebas

```sh
npm test
```

Esta aplicación es una base local de demostración. Para publicarla se deben añadir HTTPS, almacenamiento seguro de sesiones compartido, administración de usuarios y protección adicional contra intentos automatizados de inicio de sesión.