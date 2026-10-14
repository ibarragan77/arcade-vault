# SPEC 18 — Actualizar Next.js y dependencias vulnerables

> **Status:** Approved
> **Depends on:** SPEC 17
> **Date:** 2026-10-14
> **Objective:** Llevar `npm audit --omit=dev` a 0 vulnerabilidades actualizando `next` (y `eslint-config-next`) a la última 16.x estable y corrigiendo `sharp` y `source-map-js`, sin cambiar el comportamiento de la app.

## Por qué existe este spec

La auditoría de `security-guardian` del 2026-10-14 marcó como **crítico** que `next@16.3.1` está en el rango vulnerable `16.0.0 – 16.3.7` y, además, `sharp` y `source-map-js` con severidad alta. El proyecto no usa `next/image` ni `next/og`, así que parte de los avisos (optimización de imágenes, `ImageResponse`) no son explotables hoy; aun así el servidor de producción corre el framework completo, por lo que se actualiza.

Estado verificado el 2026-10-14:

- `package.json` fija `"next": "16.3.1"` y `"eslint-config-next": "16.3.1"` **exactos** (sin `^`). `react` y `react-dom` están en `19.2.8`.
- `npm audit --omit=dev`: 3 vulnerabilidades (1 crítica, 2 altas). `sharp` y `source-map-js` se corrigen con `npm audit fix`; `next` exige `16.4.1`, fuera del rango declarado.
- `npm view next version` devuelve `16.4.1` como última publicada.
- `next.config.ts` define `allowedDevOrigins` y los 5 headers de seguridad del SPEC 17.
- `CLAUDE.md` menciona "Next.js 16.3.1" en la sección Arquitectura.

## Scope

**In:**

- Subir `next` y `eslint-config-next` a la última 16.x estable (hoy `16.4.1`), manteniendo el pin exacto y la misma versión en ambos.
- Aplicar `npm audit fix` para `sharp` y `source-map-js` (solo cambia `package-lock.json`).
- Leer `node_modules/next/dist/docs/` tras la actualización por cambios incompatibles relevantes (`proxy.ts`, `headers`, `PageProps`/`LayoutProps`, route handlers) y ajustar el código solo si el build o el lint lo exigen.
- Verificación: `npm run build`, `npm run lint`, `npm audit --omit=dev` y recorrido manual de rutas clave.
- Actualizar la versión mencionada en `CLAUDE.md` y registrar el cierre del hallazgo en `references/security/security-checklist.md`.

**Out of scope (para specs futuros):**

- Actualizar `react` / `react-dom` u otras dependencias que no tengan aviso.
- Corregir vulnerabilidades de `devDependencies`.
- Cambiar la política de pin exacto a rangos (`^`) o automatizar con Dependabot/Renovate.
- Los hallazgos 2, 3 y 4 de la auditoría (privilegios de tablas, `/api/supabase-health`, validación de `/api/contact`): irán en otro spec.
- Cualquier cambio de funcionalidad, UI o de los juegos.

## Data model

Este spec no introduce datos ni estructuras nuevas. Solo cambian versiones en `package.json` y `package-lock.json`:

```json
{
  "next": "<última 16.x estable, p. ej. 16.4.1>",
  "eslint-config-next": "<la misma versión que next>"
}
```

Convenciones:

- Ambas versiones se escriben exactas, sin `^` ni `~`.
- `sharp` y `source-map-js` no se declaran en `package.json`: son transitivas y solo se mueven en el lockfile.

## Implementation plan

**Flujo de trabajo en git:** `/spec-impl 18-dependency-updates` crea y cambia a la rama `spec-18-dependency-updates`. Cada paso se revisa antes de seguir; no se commitea automáticamente.

1. **Línea base.** Correr `npm run build`, `npm run lint` y `npm audit --omit=dev` antes de tocar nada y anotar el resultado (3 vulnerabilidades esperadas). Sistema funcional: sin cambios.
2. **Dependencias transitivas.** Correr `npm audit fix` (sin `--force`). Debe tocar solo `package-lock.json` y dejar `sharp` y `source-map-js` corregidos. Verificar con `git diff --stat` que `package.json` no cambió y con `npm run build` que compila.
3. **Next.js.** Consultar `npm view next version`, actualizar `next` y `eslint-config-next` a esa misma versión exacta con `npm install --save-exact next@<v> eslint-config-next@<v>`. Confirmar que `react`/`react-dom` no cambian.
4. **Revisar cambios incompatibles.** Leer `node_modules/next/dist/docs/` (guía de upgrade y `01-app/`) y comparar con el uso actual: `proxy.ts`, `headers` en `next.config.ts`, `PageProps`/`LayoutProps`, route handlers (`app/api/*`, `app/auth/*`). Corregir solo lo que `npm run build` o `npm run lint` reporten; cualquier otro hallazgo se anota para un spec nuevo.
5. **Verificación completa.** `npm run build`, `npm run lint` y `npm audit --omit=dev` (debe dar 0). Con `npm run dev`: recorrido manual de home, `/games`, `/salon`, un juego jugable, `/login`, `/registro`, `/perfil` (con y sin sesión), `POST /api/contact` y `curl -I` para confirmar los 5 headers del SPEC 17.
6. **Documentación.** Actualizar la versión en `CLAUDE.md` y marcar el hallazgo de dependencias como resuelto en `references/security/security-checklist.md`.

## Acceptance criteria

- [ ] `npm audit --omit=dev` reporta `found 0 vulnerabilities`.
- [ ] `package.json` tiene `next` y `eslint-config-next` en la misma versión exacta (sin `^`), igual a la salida de `npm view next version` el día de la implementación y mayor o igual a `16.4.1`.
- [ ] `react` y `react-dom` siguen en `19.2.8`.
- [ ] `npm run build` termina sin errores de compilación ni de TypeScript.
- [ ] `npm run lint` no reporta errores.
- [ ] `curl -I` a `/`, `/login`, `/juegos/<id>/jugar` y `/api/supabase-health` sigue devolviendo los 5 headers de seguridad del SPEC 17.
- [ ] Sin sesión, `/perfil` redirige a `/login`; con sesión, carga.
- [ ] Un juego (p. ej. `/juegos/asteroides/jugar`) carga, arranca y guarda un puntaje sin errores en la consola.
- [ ] Login con correo, `/auth/confirm` y `/auth/callback` siguen respondiendo igual que antes (sin errores 500).
- [ ] `POST /api/contact` con un body válido sigue respondiendo como antes.
- [ ] El diff de código fuente fuera de `package.json`, `package-lock.json`, `CLAUDE.md` y `references/security/` está vacío, o cada cambio está justificado por un error de build/lint documentado en el paso 4.
- [ ] `CLAUDE.md` menciona la versión nueva de Next.js.

## Decisions

- **Sí:** última 16.x estable. Razón: decisión del usuario; el número exacto se fija al implementar con `npm view next version` (hoy `16.4.1`).
- **Sí:** mantener el pin exacto. Razón: es la convención actual del repo y evita actualizaciones silenciosas; `eslint-config-next` va siempre en la misma versión que `next`.
- **Sí:** `npm audit fix` sin `--force` para `sharp` y `source-map-js`. Razón: solo toca el lockfile; `--force` se reserva para `next`, que se sube de forma explícita.
- **No:** usar `npm audit fix --force`. Razón: puede mover otras dependencias fuera de rango sin control.
- **No:** actualizar `react`/`react-dom`. Razón: no tienen aviso y ampliarían el riesgo de regresión en los juegos de canvas.
- **No:** incluir `devDependencies`. Razón: decisión del usuario; el hallazgo crítico es de producción.
- **Sí:** build + lint + recorrido manual como verificación. Razón: decisión del usuario; el repo no tiene suite de tests, y `proxy.ts`/rutas de auth solo se validan en ejecución.
- **Sí:** el hallazgo se trata como crítico aunque no se use `next/image`/`next/og`. Razón: el resto de avisos (cache poisoning, divulgación de información, RCE en Windows) afectan al servidor sin depender de esas APIs.

## Risks

| Riesgo                                                                                     | Mitigación                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| La nueva versión de Next cambia el comportamiento de `proxy.ts`, headers o route handlers. | Paso 4 revisa los docs; el paso 5 recorre `/perfil`, `/auth/*`, `/api/*` y los headers.                      |
| Cambios en tipos autogenerados (`PageProps`/`LayoutProps`) rompen el build.                | Se regeneran con `next build`/`next typegen`; el error de build indica el archivo exacto.                    |
| `npm audit fix` mueve una transitiva y rompe el entorno de desarrollo en Windows.          | El paso 2 verifica el build antes de tocar `next`; si falla, se revierte el lockfile con `git checkout`.     |
| La última 16.x trae nuevos avisos o regresiones aún no reportados.                         | Se fija una versión exacta y el criterio de aceptación exige `npm audit` limpio el día de la implementación. |
| El hook de formato o ESLint (`eslint-config-next`) añade reglas nuevas que fallan.         | Se corrigen solo errores bloqueantes; las advertencias nuevas se anotan sin ampliar el alcance.              |

## What is **not** in this spec

- Actualización de `react`, `react-dom` o dependencias sin aviso.
- Vulnerabilidades de `devDependencies`.
- Dependabot/Renovate o cambio de política de pin.
- Hallazgos 2, 3 y 4 de la auditoría (privilegios de tablas, `/api/supabase-health`, `/api/contact`).
- Cambios de funcionalidad, UI o de juegos.

Cada uno de estos, si se implementa, va en su propio spec.
