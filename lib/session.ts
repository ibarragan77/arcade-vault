// ===== lib/session.ts — sesión real de Supabase Auth (cookies vía @supabase/ssr) =====
"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { signOut } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

// Clave de la sesión simulada anterior (SPEC 01); se limpia al arrancar.
const LEGACY_STORAGE_KEY = "av_user";

// `name` es el `profiles.username`. `id` es el `auth.users.id` (se usa para vincular puntajes).
export type SessionUser = { id: string; name: string } | null;

// El username no cambia durante la sesión, así que se cachea para no repetir la consulta
// en cada componente que usa useSession() (Nav, GamePlayer...).
const usernameCache = new Map<string, string>();

async function resolveUser(
  supabase: SupabaseClient,
  authUser: User,
): Promise<SessionUser> {
  const cached = usernameCache.get(authUser.id);
  if (cached) return { id: authUser.id, name: cached };

  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", authUser.id)
    .maybeSingle();
  const name: string = data?.username ?? "JUGADOR";
  usernameCache.set(authUser.id, name);
  return { id: authUser.id, name };
}

export function useSession() {
  // Se inicializa en null para que el primer render coincida con el servidor
  // (que no conoce las cookies del navegador) y se sincroniza en el useEffect siguiente.
  const [user, setUser] = useState<SessionUser>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // localStorage no disponible (modo privado, etc.)
    }

    const apply = async (authUser: User | null) => {
      const next = authUser ? await resolveUser(supabase, authUser) : null;
      if (active) setUser(next);
    };

    // onAuthStateChange emite INITIAL_SESSION al suscribirse, así que cubre la carga inicial,
    // el inicio/cierre de sesión y los cambios hechos en otra pestaña.
    // No se llama a otros métodos de supabase dentro del callback (riesgo de deadlock):
    // se difiere con setTimeout.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void apply(session?.user ?? null), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Compatibilidad con la API anterior: el inicio de sesión real lo hace lib/auth.ts
  // (signIn), así que aquí solo se vuelve a leer la sesión actual de Supabase.
  const login = useCallback(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(async ({ data }) => {
      setUser(
        data.session ? await resolveUser(supabase, data.session.user) : null,
      );
    });
  }, []);

  // El invitado es simplemente "sin sesión": se cierra la sesión si había una.
  const logout = useCallback(async () => {
    await signOut(createClient());
    setUser(null);
  }, []);

  const loginAsGuest = logout;

  return { user, login, loginAsGuest, logout };
}
