import { Resend } from "resend";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactRequestBody = {
  name?: string;
  email?: string;
  msg?: string;
  company?: string;
};

export async function POST(request: Request) {
  let body: ContactRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const msg = body.msg?.trim() ?? "";
  const company = body.company?.trim() ?? "";

  if (!name || !email || !msg || !EMAIL_REGEX.test(email)) {
    return Response.json({ error: "Campos inválidos" }, { status: 400 });
  }

  if (company) {
    return Response.json({ ok: true });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: process.env.CONTACT_EMAIL_TO!,
      subject: `Nuevo mensaje de ${name} — Arcade Vault`,
      text: `Nombre: ${name}\nCorreo: ${email}\n\nMensaje:\n${msg}`,
    });

    if (error) {
      return Response.json({ error: "No se pudo enviar el mensaje" }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "No se pudo enviar el mensaje" }, { status: 502 });
  }
}
