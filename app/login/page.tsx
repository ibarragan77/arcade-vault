import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  // /auth/confirm redirige aquí con ?error=enlace cuando el enlace del correo es inválido o venció.
  return <LoginForm linkError={error === "enlace"} />;
}
