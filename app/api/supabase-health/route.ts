import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getUser();

    // "Auth session missing" es la respuesta esperada: todavía no hay login real
    // (fuera de alcance de este spec), no un error de conectividad.
    if (error && error.name !== "AuthSessionMissingError") {
      console.error("[supabase-health]", error);
      return Response.json(
        { ok: false, error: "Servicio no disponible" },
        { status: 500 },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[supabase-health]", err);
    return Response.json(
      { ok: false, error: "Servicio no disponible" },
      { status: 500 },
    );
  }
}
