## Arcade Vault

Es una plataforma para jugar online y competir por la mayor cantidad de puntos.

## Usa Spec Driven Design

Basado en /spec y /spec-impl

Siguiendo las buenas prácticas recomendadas aquí:
https://github.com/Klerith/fernando-skills

## Skills usadas

```bash
npx skills@latest add Klerith/fernando-skills
```

## Autenticación (Supabase Auth)

El registro y el inicio de sesión usan Supabase Auth con correo y contraseña (que **exige confirmar el correo**) y con Google y GitHub (OAuth). Antes de probarlo hay que configurar el proyecto en el Dashboard de Supabase (no se puede hacer desde el código):

1. **Authentication → Providers → Email:** activado, con _Confirm email_ activado.
2. **Authentication → URL Configuration:** `Site URL` = la URL de la app (en local, `http://localhost:3000`) y agregar `http://localhost:3000/auth/confirm` (y la URL de producción equivalente) a _Redirect URLs_.
3. **Authentication → Email Templates:** el enlace de cada plantilla debe pasar por `/auth/confirm`:
   - _Confirm signup_: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
   - _Reset password_: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

No hay variables de entorno nuevas: se reutilizan `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

El SMTP por defecto de Supabase envía muy pocos correos por hora y, en proyectos nuevos, solo a miembros del equipo. Si un correo no llega al probar, revisa _Authentication → Users_ o configura un SMTP propio.

### Inicio de sesión con Google y GitHub

Los botones de `/login` y `/registro` usan OAuth con PKCE. Hay que configurar, fuera del código:

1. **Authentication → Providers → Google** y **GitHub:** activados, con el _Client ID_ y el _Client Secret_ de cada app.
2. **Google Cloud Console** (_Authorized redirect URI_) y **GitHub** (_Authorization callback URL_): `https://<ref-del-proyecto>.supabase.co/auth/v1/callback`.
3. **Authentication → URL Configuration → Redirect URLs:** agregar `http://localhost:3000/auth/callback` (y la URL de producción equivalente).

Notas:

- El retorno del proveedor pasa por `/auth/callback`, que intercambia el `code` por la sesión. Si algo falla, redirige a `/login?error=oauth`. El inicio y el retorno deben ocurrir en el mismo navegador (el verificador PKCE vive en cookies).
- Quien entra por primera vez recibe un `username` autogenerado (hasta 6 caracteres del nombre del proveedor + 4 dígitos); lo crea el trigger `handle_new_user`. Por ahora no se puede cambiar.
- Si el correo del proveedor ya tiene una cuenta, Supabase vincula la identidad a esa cuenta (conserva `username` y puntajes). Por eso solo se deben habilitar proveedores que entreguen correos verificados.

## Commands

- `npm run dev` — start the dev server (Turbopack, via `next dev`)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`, extends `eslint-config-next` core-web-vitals + typescript)
