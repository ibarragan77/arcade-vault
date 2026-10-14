import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Retorno del inicio de sesión con Google/GitHub (OAuth con PKCE): llega un `code`
// que se intercambia por la sesión. Distinto de /auth/confirm, que recibe `token_hash`.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, request.url));

  // Si el usuario cancela el consentimiento, el proveedor vuelve con `error` y sin `code`.
  if (
    !code ||
    searchParams.has("error") ||
    searchParams.has("error_description")
  ) {
    return redirectTo("/login?error=oauth");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectTo("/login?error=oauth");
  }

  return redirectTo("/");
}
