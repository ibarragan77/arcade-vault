## Checklist de seguridad básico

Estado según SPEC 17 (2026-10-14).

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

## Por el lado de Supabase:

Los 3 avisos originales de `get_advisors` (2026-10-14): `anon_security_definer_function_executable` y `authenticated_security_definer_function_executable` (cerrados con la migración `revoke_execute_rls_auto_enable`) y `auth_leaked_password_protection` (pendiente, plan Pro).
