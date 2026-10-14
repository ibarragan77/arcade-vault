"use client";

import { useState } from "react";
import { signInWithOAuth, type OAuthProvider } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: "google", label: "◆ GOOGLE" },
  { id: "github", label: "▣ GITHUB" },
];

// Botones de Google/GitHub compartidos por /login y /registro. El separador
// ("O CONTINÚA CON") lo pone cada pantalla.
export default function OAuthButtons() {
  const [loading, setLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (provider: OAuthProvider) => {
    if (loading) return;
    setError(null);
    setLoading(provider);
    const result = await signInWithOAuth(createClient(), provider);
    // En el caso exitoso el navegador ya está redirigiendo al proveedor: no se reactiva nada.
    if (!result.ok) {
      setError(result.error);
      setLoading(null);
    }
  };

  return (
    <>
      {error && (
        <div className="auth-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <div className="social">
        {PROVIDERS.map(({ id, label }) => (
          <button
            key={id}
            className="btn ghost"
            type="button"
            disabled={loading !== null}
            onClick={() => start(id)}
          >
            {loading === id ? "REDIRIGIENDO…" : label}
          </button>
        ))}
      </div>
    </>
  );
}
