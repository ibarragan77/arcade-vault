import { Resend } from "resend";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_NAME = 80;
const MAX_EMAIL = 254;
const MAX_MSG = 2000;

// Caracteres de control (incluye \r y \n): no pueden llegar al asunto del correo.
const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]+/g;

type ContactRequestBody = {
  name?: unknown;
  email?: unknown;
  msg?: unknown;
  company?: unknown;
};

export async function POST(request: Request) {
  let body: ContactRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Cuerpo de la solicitud inválido" },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Campos inválidos" }, { status: 400 });
  }

  const {
    name: rawName,
    email: rawEmail,
    msg: rawMsg,
    company: rawCompany,
  } = body;

  if (
    typeof rawName !== "string" ||
    typeof rawEmail !== "string" ||
    typeof rawMsg !== "string" ||
    (rawCompany !== undefined && typeof rawCompany !== "string")
  ) {
    return Response.json({ error: "Campos inválidos" }, { status: 400 });
  }

  const name = rawName.trim();
  const email = rawEmail.trim();
  const msg = rawMsg.trim();
  const company = rawCompany?.trim() ?? "";

  if (
    !name ||
    !email ||
    !msg ||
    name.length > MAX_NAME ||
    email.length > MAX_EMAIL ||
    msg.length > MAX_MSG ||
    !EMAIL_REGEX.test(email)
  ) {
    return Response.json({ error: "Campos inválidos" }, { status: 400 });
  }

  if (company) {
    return Response.json({ ok: true });
  }

  const subjectName = name
    .replace(CONTROL_CHARS_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: process.env.CONTACT_EMAIL_TO!,
      subject: `Nuevo mensaje de ${subjectName} — Arcade Vault`,
      text: `Nombre: ${name}\nCorreo: ${email}\n\nMensaje:\n${msg}`,
    });

    if (error) {
      return Response.json(
        { error: "No se pudo enviar el mensaje" },
        { status: 502 },
      );
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "No se pudo enviar el mensaje" },
      { status: 502 },
    );
  }
}
