"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PASSWORD_MIN,
  signUp,
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

type FieldErrors = Partial<
  Record<"username" | "email" | "password" | "confirm", string>
>;

export default function RegistroPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const found: FieldErrors = {
      username: validateUsername(username) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
      confirm:
        password !== confirm ? "Las contraseñas no coinciden." : undefined,
    };
    setErrors(found);
    setFormError(null);
    if (Object.values(found).some(Boolean)) return;

    setLoading(true);
    const result = await signUp(createClient(), { username, email, password });
    setLoading(false);

    if (result.ok) {
      setSentTo(email.trim());
    } else {
      setFormError(result.error);
    }
  };

  const field = (
    id: keyof FieldErrors,
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) => (
    <div className={`field${errors[id] ? " invalid" : ""}`}>
      <label htmlFor={`reg-${id}`}>{label}</label>
      {input}
      {errors[id] ? (
        <span className="field-error" id={`reg-${id}-msg`}>
          {errors[id]}
        </span>
      ) : (
        hint && (
          <span className="hint" id={`reg-${id}-msg`}>
            {hint}
          </span>
        )
      )}
    </div>
  );

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">CREAR CUENTA</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            NUEVO JUGADOR · ARCADE VAULT
          </div>
        </div>

        {sentTo ? (
          <div className="auth-sent" role="status">
            <h3 className="neon-green">REVISA TU CORREO</h3>
            <p>
              Enviamos un enlace de confirmación a <strong>{sentTo}</strong>.
            </p>
            <p>Abre el enlace para activar tu cuenta y empezar a jugar.</p>
            <div className="auth-links">
              <Link href="/login">Ir a iniciar sesión</Link>
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

              {field(
                "username",
                "Usuario",
                <input
                  id="reg-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toUpperCase())}
                  placeholder="PX_KAI"
                  maxLength={10}
                  autoComplete="username"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={!!errors.username}
                  aria-describedby="reg-username-msg"
                />,
                "3 a 10 caracteres: letras, números o _. Es el nombre que verás en el salón.",
              )}
              {field(
                "email",
                "Correo electrónico",
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jugador@vault.gg"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby="reg-email-msg"
                />,
              )}
              {field(
                "password",
                "Contraseña",
                <input
                  id="reg-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  aria-describedby="reg-password-msg"
                />,
                `Mínimo ${PASSWORD_MIN} caracteres.`,
              )}
              {field(
                "confirm",
                "Repetir contraseña",
                <input
                  id="reg-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirm}
                  aria-describedby="reg-confirm-msg"
                />,
              )}

              <button
                className="btn lg"
                type="submit"
                disabled={loading}
                style={{ width: "100%", marginTop: 8 }}
              >
                {loading ? "CREANDO CUENTA…" : "CREAR CUENTA"}
              </button>
            </form>

            <div className="auth-links">
              <span>
                ¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link>
              </span>
              <Link href="/">Jugar como invitado</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
