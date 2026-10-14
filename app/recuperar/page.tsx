"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset, validateEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const invalid = validateEmail(email);
    setEmailError(invalid);
    setFormError(null);
    if (invalid) return;

    setLoading(true);
    const result = await requestPasswordReset(createClient(), email);
    setLoading(false);

    if (result.ok) {
      setSentTo(email.trim());
    } else {
      setFormError(result.error);
    }
  };

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">RECUPERAR ACCESO</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            NUEVA CONTRASEÑA POR CORREO
          </div>
        </div>

        {sentTo ? (
          <div className="auth-sent" role="status">
            <h3 className="neon-green">REVISA TU CORREO</h3>
            <p>
              Si <strong>{sentTo}</strong> tiene una cuenta, te enviamos un
              enlace para elegir una contraseña nueva.
            </p>
            <p>
              El enlace caduca pronto. Si no lo ves, revisa la carpeta de spam.
            </p>
            <div className="auth-links">
              <Link href="/login">Volver a iniciar sesión</Link>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={submit} noValidate>
              {formError && (
                <div className="auth-error" role="alert">
                  {formError}
                </div>
              )}

              <div className={`field${emailError ? " invalid" : ""}`}>
                <label htmlFor="rec-email">Correo electrónico</label>
                <input
                  id="rec-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jugador@vault.gg"
                  autoComplete="email"
                  aria-invalid={!!emailError}
                  aria-describedby={
                    emailError ? "rec-email-msg" : "rec-email-hint"
                  }
                />
                {emailError ? (
                  <span className="field-error" id="rec-email-msg">
                    {emailError}
                  </span>
                ) : (
                  <span className="hint" id="rec-email-hint">
                    El correo con el que creaste tu cuenta.
                  </span>
                )}
              </div>

              <button
                className="btn lg"
                type="submit"
                disabled={loading}
                style={{ width: "100%", marginTop: 8 }}
              >
                {loading ? "ENVIANDO…" : "ENVIAR ENLACE"}
              </button>
            </form>

            <div className="auth-links">
              <Link href="/login">Volver a iniciar sesión</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
