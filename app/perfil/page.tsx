import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";

const PROVIDER_LABELS: Record<string, string> = {
  email: "Correo y contraseña",
  google: "Google",
  github: "GitHub",
};

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts ya redirige a /login sin sesión; esto cubre el caso de que el proxy no corra.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  // Una cuenta puede tener varias identidades (correo + Google, etc.) por la vinculación automática.
  const providers = [
    ...new Set(
      user.identities?.map((i) => i.provider) ??
        (user.app_metadata.providers as string[] | undefined) ??
        [],
    ),
  ].map((p) => PROVIDER_LABELS[p] ?? p);

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark" />
          <h2 className="neon-cyan">MI PERFIL</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            JUGADOR REGISTRADO
          </div>
        </div>

        <div className="profile-rows">
          <div className="profile-row">
            <span className="l">Usuario</span>
            <span className="v name">{profile?.username ?? "JUGADOR"}</span>
          </div>
          <div className="profile-row">
            <span className="l">Correo electrónico</span>
            <span className="v">{user.email || "—"}</span>
          </div>
          <div className="profile-row">
            <span className="l">Método de acceso</span>
            <span className="v">
              {providers.length > 0 ? providers.join(" · ") : "—"}
            </span>
          </div>
        </div>

        <LogoutButton />
      </div>
    </div>
  );
}
