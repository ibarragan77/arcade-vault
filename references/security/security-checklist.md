## Checklist de seguridad básico

Estado según SPEC 17. Última verificación en vivo: 2026-10-14 (security-guardian).

- [x] RLS: Row Level Security habilitado en ambas tablas: `games` y `scores` (también `profiles`)
- [x] Minimum password length — mínimo 8 caracteres
- [x] Password requirements — minúsculas, mayúsculas, dígitos y símbolos (Dashboard + `validatePassword`)
- [ ] Leaked password protection — (el warning 4). Pendiente: requiere plan Pro de Supabase
- [ ] Max signup rate — limitar signups por IP (anti-bot). Pendiente: la opción no está disponible en el plan actual; valor recomendado 10 peticiones / 5 min por IP
- [x] Headers de seguridad en Next.js (`next.config.ts`)
- [x] `rls_auto_enable()` sin `EXECUTE` para `anon` y `authenticated` (2 warnings cerrados)

Ej:

```ts
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

// En la config de Next.js:
headers: async () => [{ source: "/(.*)", headers: securityHeaders }];
```

## Verificado el 2026-10-14 (security-guardian)

- [x] RLS en `games`, `scores` y `profiles`; políticas sin `true` en escritura (2026-10-14)
- [x] `handle_new_user` y `rls_auto_enable`: `SECURITY DEFINER` con `search_path` fijo y sin EXECUTE para anon/authenticated (2026-10-14)
- [x] Headers de seguridad confirmados con `curl -I` en localhost:3000 (2026-10-14)
- [x] `/auth/confirm` y `/auth/callback`: destinos fijos, sin open redirect (2026-10-14)
- [x] `/perfil` usa `getUser()`; sin XSS (`dangerouslySetInnerHTML`/`innerHTML`/`eval`), sin `target="_blank"`, `.env*` no versionado (2026-10-14)
- [ ] `npm audit --omit=dev` limpio — FALLA: 1 crítica (`next`), 2 altas (`sharp`, `source-map-js`) (2026-10-14)
- [ ] Privilegios de tabla mínimos para anon/authenticated — FALLA: tienen TRUNCATE/TRIGGER/REFERENCES (2026-10-14)

## Por el lado de Supabase:

Los 3 avisos originales de `get_advisors` (2026-10-14): `anon_security_definer_function_executable` y `authenticated_security_definer_function_executable` (cerrados con la migración `revoke_execute_rls_auto_enable`) y `auth_leaked_password_protection` (pendiente, plan Pro).
