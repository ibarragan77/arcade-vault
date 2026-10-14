"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resendConfirmation, signIn, validateEmail } from "@/lib/auth";
import OAuthButtons from "@/components/auth/OAuthButtons";
import { useSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/client";

type Notice = { kind: "error" | "info"; text: string };

export default function LoginForm({
  linkError,
  oauthError,
}: {
  linkError: boolean;
  oauthError: boolean;
}) {
  const router = useRouter();
  const { loginAsGuest } = useSession();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(
    linkError
      ? {
          kind: "error",
          text: "El enlace del correo no es válido o ya venció. Solicita uno nuevo.",
        }
      : oauthError
        ? {
            kind: "error",
            text: "No se pudo iniciar sesión con ese proveedor. Inténtalo de nuevo.",
          }
        : null,
  );
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const invalid = validateEmail(email);
    setEmailError(invalid);
    setNotice(null);
    setNeedsConfirm(false);
    if (invalid) return;
    if (!pass) {
      setNotice({ kind: "error", text: "Ingresa tu contraseña." });
      return;
    }

    setLoading(true);
    const result = await signIn(createClient(), email, pass);
    setLoading(false);

    if (result.ok) {
      router.push("/");
      router.refresh(); // los Server Components deben releer las cookies de sesión
      return;
    }
    setNotice({ kind: "error", text: result.error });
    setNeedsConfirm(result.code === "email_not_confirmed");
  };

  const resend = async () => {
    setLoading(true);
    const result = await resendConfirmation(createClient(), email);
    setLoading(false);
    setNotice(
      result.ok
        ? { kind: "info", text: "Te enviamos un nuevo correo de confirmación." }
        : { kind: "error", text: result.error },
    );
    if (result.ok) setNeedsConfirm(false);
  };

  const playAsGuest = async () => {
    await loginAsGuest();
    router.push("/");
  };

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">ARCADE VAULT</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            ACCESO AL SISTEMA · v2.6
          </div>
        </div>

        <form onSubmit={submit} noValidate>
          {notice && (
            <div
              className={notice.kind === "error" ? "auth-error" : "auth-info"}
              role="alert"
            >
              {notice.text}
              {needsConfirm && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="auth-inline-btn"
                    onClick={resend}
                    disabled={loading}
                  >
                    Reenviar correo
                  </button>
                </>
              )}
            </div>
          )}

          <div className={`field${emailError ? " invalid" : ""}`}>
            <label htmlFor="login-email">Correo electrónico</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jugador@vault.gg"
              autoComplete="email"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "login-email-msg" : undefined}
            />
            {emailError && (
              <span className="field-error" id="login-email-msg">
                {emailError}
              </span>
            )}
          </div>
          <div className="field">
            <label htmlFor="login-pass">Contraseña</label>
            <input
              id="login-pass"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            className="btn lg"
            type="submit"
            disabled={loading}
            style={{ width: "100%", marginTop: 8 }}
          >
            {loading ? "ENTRANDO…" : "ENTRAR AL VAULT"}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/recuperar">¿Olvidaste tu contraseña?</Link>
          <span>
            ¿Sin cuenta? <Link href="/registro">Crear cuenta</Link>
          </span>
        </div>

        <button
          className="btn ghost"
          type="button"
          style={{ width: "100%", marginTop: 18 }}
          onClick={playAsGuest}
        >
          JUGAR COMO INVITADO
        </button>

        <div className="auth-divider">O CONTINÚA CON</div>
        <OAuthButtons />

        <div
          style={{
            marginTop: 18,
            textAlign: "center",
            fontSize: 11,
            color: "var(--ink-faint)",
            letterSpacing: "0.1em",
          }}
        >
          AL ENTRAR ACEPTAS LOS TÉRMINOS DEL SALÓN ARCADE
        </div>
      </div>
    </div>
  );
}
