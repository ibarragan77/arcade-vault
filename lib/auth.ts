import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

export type SignUpInput = { username: string; email: string; password: string };

export const USERNAME_RE = /^[A-Za-z0-9_]{3,10}$/;
export const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// `code` permite a la pantalla reaccionar a casos concretos (p. ej. correo sin confirmar).
export type AuthResult =
  { ok: true } | { ok: false; error: string; code?: string };

export function validateUsername(username: string): string | null {
  return USERNAME_RE.test(username.trim())
    ? null
    : "El usuario debe tener de 3 a 10 caracteres: letras, números o guion bajo.";
}

export function validateEmail(email: string): string | null {
  return EMAIL_RE.test(email.trim())
    ? null
    : "Ingresa un correo electrónico válido.";
}

export function validatePassword(password: string): string | null {
  return password.length >= PASSWORD_MIN
    ? null
    : `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
}

// Nunca se muestra el texto crudo de Supabase: se traduce por `code` y, si no se
// reconoce, se devuelve un mensaje genérico.
function mapError(error: AuthError): AuthResult {
  const code = error.code;
  const messages: Record<string, string> = {
    invalid_credentials: "Correo o contraseña incorrectos.",
    email_not_confirmed:
      "Aún no confirmaste tu correo. Revisa tu bandeja de entrada.",
    user_already_exists: "Ya existe una cuenta con ese correo.",
    email_exists: "Ya existe una cuenta con ese correo.",
    weak_password: `La contraseña es demasiado débil. Usa al menos ${PASSWORD_MIN} caracteres.`,
    same_password: "La nueva contraseña debe ser distinta de la anterior.",
    over_email_send_rate_limit:
      "Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.",
    over_request_rate_limit:
      "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    session_not_found: "El enlace expiró. Solicita uno nuevo.",
    // El trigger de `profiles` falla por username duplicado en una condición de carrera.
    unexpected_failure: "Ese nombre de usuario no está disponible.",
    signup_disabled: "El registro está deshabilitado por ahora.",
  };
  return {
    ok: false,
    error:
      (code && messages[code]) ||
      "No se pudo completar la operación. Inténtalo de nuevo.",
    code,
  };
}

export async function isUsernameAvailable(
  supabase: SupabaseClient,
  username: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username.trim().toUpperCase())
    .maybeSingle();
  return !data;
}

export async function signUp(
  supabase: SupabaseClient,
  input: SignUpInput,
): Promise<AuthResult> {
  const username = input.username.trim().toUpperCase();
  const email = input.email.trim();

  const invalid =
    validateUsername(username) ??
    validateEmail(email) ??
    validatePassword(input.password);
  if (invalid) return { ok: false, error: invalid };

  if (!(await isUsernameAvailable(supabase, username))) {
    return { ok: false, error: "Ese nombre de usuario no está disponible." };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { data: { username } },
  });
  return error ? mapError(error) : { ok: true };
}

export async function signIn(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  return error ? mapError(error) : { ok: true };
}

export type OAuthProvider = "google" | "github";

// Redirige el navegador al proveedor (PKCE); al volver, /auth/callback intercambia el `code`.
// Solo devuelve resultado si falla antes de redirigir: en el caso exitoso la página se descarga.
export async function signInWithOAuth(
  supabase: SupabaseClient,
  provider: OAuthProvider,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  return error ? mapError(error) : { ok: true };
}

export async function signOut(supabase: SupabaseClient): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  return error ? mapError(error) : { ok: true };
}

export async function resendConfirmation(
  supabase: SupabaseClient,
  email: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim(),
  });
  return error ? mapError(error) : { ok: true };
}

export async function requestPasswordReset(
  supabase: SupabaseClient,
  email: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? mapError(error) : { ok: true };
}

export async function updatePassword(
  supabase: SupabaseClient,
  password: string,
): Promise<AuthResult> {
  const invalid = validatePassword(password);
  if (invalid) return { ok: false, error: invalid };

  const { error } = await supabase.auth.updateUser({ password });
  return error ? mapError(error) : { ok: true };
}
