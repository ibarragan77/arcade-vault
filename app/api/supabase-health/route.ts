import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getUser();

    // "Auth session missing" es la respuesta esperada: todavía no hay login real
    // (fuera de alcance de este spec), no un error de conectividad.
    if (error && error.name !== "AuthSessionMissingError") {
      return Response.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
