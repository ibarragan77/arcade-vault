import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  // /auth/confirm redirige aquí con ?error=enlace cuando el enlace del correo es inválido o venció.
  // /auth/callback redirige con ?error=oauth cuando falla el inicio de sesión con Google/GitHub.
  return (
    <LoginForm linkError={error === "enlace"} oauthError={error === "oauth"} />
  );
}
