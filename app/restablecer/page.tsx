"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PASSWORD_HINT, updatePassword, validatePassword } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

type Access = "checking" | "granted" | "denied";

export default function RestablecerPage() {
  const router = useRouter();
  // Se llega aquí desde /auth/confirm (type=recovery), que deja una sesión de recuperación.
  const [access, setAccess] = useState<Access>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setAccess(data.session ? "granted" : "denied");
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const pwError = validatePassword(password);
    const cfError =
      password !== confirm ? "Las contraseñas no coinciden." : null;
    setPasswordError(pwError);
    setConfirmError(pwError ? null : cfError);
    setFormError(null);
    if (pwError || cfError) return;

    setLoading(true);
    const result = await updatePassword(createClient(), password);
    setLoading(false);

    if (result.ok) {
      router.push("/");
      router.refresh();
    } else {
      setFormError(result.error);
    }
  };

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">NUEVA CONTRASEÑA</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            RESTABLECER ACCESO
          </div>
        </div>

        {access === "checking" && (
          <div className="auth-sent" role="status">
            <p>Verificando enlace…</p>
          </div>
        )}

        {access === "denied" && (
          <div className="auth-sent" role="alert">
            <h3 className="neon-magenta">ENLACE NO VÁLIDO</h3>
            <p>
              El enlace de recuperación venció o ya se usó. Solicita uno nuevo.
            </p>
            <div className="auth-links">
              <Link href="/recuperar">Solicitar otro enlace</Link>
              <Link href="/login">Volver a iniciar sesión</Link>
            </div>
          </div>
        )}

        {access === "granted" && (
          <form onSubmit={submit} noValidate>
            {formError && (
              <div className="auth-error" role="alert">
                {formError}
              </div>
            )}

            <div className={`field${passwordError ? " invalid" : ""}`}>
              <label htmlFor="rst-password">Contraseña nueva</label>
              <input
                id="rst-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={!!passwordError}
                aria-describedby="rst-password-msg"
              />
              {passwordError ? (
                <span className="field-error" id="rst-password-msg">
                  {passwordError}
                </span>
              ) : (
                <span className="hint" id="rst-password-msg">
                  {PASSWORD_HINT}
                </span>
              )}
            </div>
            <div className={`field${confirmError ? " invalid" : ""}`}>
              <label htmlFor="rst-confirm">Repetir contraseña</label>
              <input
                id="rst-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                aria-invalid={!!confirmError}
                aria-describedby={confirmError ? "rst-confirm-msg" : undefined}
              />
              {confirmError && (
                <span className="field-error" id="rst-confirm-msg">
                  {confirmError}
                </span>
              )}
            </div>

            <button
              className="btn lg"
              type="submit"
              disabled={loading}
              style={{ width: "100%", marginTop: 8 }}
            >
              {loading ? "GUARDANDO…" : "GUARDAR CONTRASEÑA"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
