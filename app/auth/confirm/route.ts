import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tipos de enlace que aceptamos; cualquier otro valor se trata como enlace inválido.
const ALLOWED_TYPES: EmailOtpType[] = ["signup", "recovery", "email"];

// Destino tras verificar el token: la recuperación va a fijar la contraseña nueva.
function destinationFor(type: EmailOtpType): string {
  return type === "recovery" ? "/restablecer" : "/";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, request.url));

  if (!tokenHash || !type || !ALLOWED_TYPES.includes(type)) {
    return redirectTo("/login?error=enlace");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    return redirectTo("/login?error=enlace");
  }

  return redirectTo(destinationFor(type));
}
