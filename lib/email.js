import "server-only";
import nodemailer from "nodemailer";
import { BUSINESS } from "./config";
import { escapeHtml } from "./security";

// Envío de emails con la cuenta de Gmail del negocio (gratis, ~500/día).
// Necesita en Vercel las variables GMAIL_USER y GMAIL_APP_PASSWORD
// (contraseña de aplicación de Google, no la contraseña normal).
// Si no están configuradas, los envíos se omiten sin romper nada.

let transporter = null;

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return transporter;
}

export function emailEnabled() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function layout(title, bodyHtml) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f1ea;font-family:Arial,Helvetica,sans-serif;color:#2b2320;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#14110e;border-radius:12px 12px 0 0;padding:20px 24px;text-align:center;">
      <span style="font-size:22px;color:#efe7da;font-weight:bold;">Fennani <span style="color:#cfa963;">Barbershop</span></span>
    </div>
    <div style="background:#ffffff;border:1px solid #e5ddd2;border-top:none;border-radius:0 0 12px 12px;padding:26px 24px;">
      <h2 style="margin:0 0 12px;font-size:19px;">${title}</h2>
      ${bodyHtml}
      <p style="margin:22px 0 0;color:#8a7f78;font-size:13px;">
        ${BUSINESS.fullName}<br/>
        📍 ${BUSINESS.address} · 📞 <a href="tel:${BUSINESS.phoneLink}" style="color:#a87f3d;">${BUSINESS.phone}</a><br/>
        Gestiona tus citas en <a href="https://hairfy.vercel.app/mis-citas" style="color:#a87f3d;">hairfy.vercel.app/mis-citas</a>
      </p>
    </div>
  </div>
</body></html>`;
}

function fmtWhen(iso) {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: BUSINESS.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Envío genérico, "best effort": nunca rompe la operación principal
export async function sendEmail(to, subject, title, bodyHtml, attachments) {
  const t = getTransporter();
  if (!t || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  try {
    await t.sendMail({
      from: `"Fennani Barbershop" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html: layout(title, bodyHtml),
      ...(attachments?.length ? { attachments } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

// Aviso interno al buzón del negocio (nueva reserva, nuevo pedido…)
export async function sendStaffNotification(subject, title, bodyHtml) {
  const inbox = process.env.GMAIL_USER;
  if (!inbox) return false;
  return sendEmail(
    inbox,
    subject,
    title,
    `${bodyHtml}
     <p style="margin:14px 0 0;"><a href="https://hairfy.vercel.app/admin" style="color:#a87f3d;">Abrir el panel de administración →</a></p>`
  );
}

// Bienvenida al crear la ficha: el código de cliente por escrito
export async function sendWelcome(to, { name, code }) {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(code);
  return sendEmail(
    to,
    "💈 Bienvenido a Fennani Barbershop — tu código de cliente",
    `¡Bienvenido, ${safeName}!`,
    `<p style="margin:0 0 8px;">Ya tienes tu ficha de cliente. Este es tu código para entrar en la web, consultar tus citas o cancelarlas:</p>
     <p style="margin:0 0 8px;font-size:22px;letter-spacing:3px;font-weight:bold;color:#a87f3d;">${safeCode}</p>
     <p style="margin:0 0 8px;color:#8a7f78;font-size:14px;">Guárdalo — funciona junto a tu número de teléfono. Puedes cambiarlo cuando quieras desde "Mis citas", y si lo pierdes te lo reenviamos a este correo.</p>
     <p style="margin:0;color:#8a7f78;font-size:14px;">Te esperamos pronto ✂️</p>`
  );
}

// Reenvío del código de acceso al cliente que lo ha olvidado
export async function sendCodeRecovery(to, { name, code }) {
  const safeName = escapeHtml(name);
  const safeCode = escapeHtml(code);
  return sendEmail(
    to,
    "🔑 Tu código de cliente — Fennani Barbershop",
    `Tu código, ${safeName}`,
    `<p style="margin:0 0 8px;">Este es tu código de cliente para entrar en la web:</p>
     <p style="margin:0 0 8px;font-size:22px;letter-spacing:3px;font-weight:bold;color:#a87f3d;">${safeCode}</p>
     <p style="margin:0;color:#8a7f78;font-size:14px;">Si no has pedido este correo, puedes ignorarlo: nadie puede entrar sin este código.</p>`
  );
}

export async function sendBookingConfirmation(to, data) {
  // Los textos vienen de datos de usuario: se escapan antes de entrar al HTML
  const { startsAt, price } = data;
  const name = escapeHtml(data.name);
  const service = escapeHtml(data.service);
  const employee = escapeHtml(data.employee);
  // Adjuntamos el evento de calendario (.ics) si tenemos la hora de fin
  let attachments;
  if (data.endsAt) {
    const { buildIcs } = await import("./ics");
    attachments = [
      {
        filename: "cita-fennani.ics",
        content: buildIcs({
          uid: data.appointmentId || `${Date.parse(startsAt)}`,
          startsAt,
          endsAt: data.endsAt,
          summary: `✂️ ${data.service} — ${BUSINESS.name}`,
          description: `${data.service} con ${data.employee}. Gestiona tu cita en https://hairfy.vercel.app/mis-citas`,
        }),
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
      },
    ];
  }
  return sendEmail(
    to,
    `✂️ Cita confirmada — ${fmtWhen(startsAt)}`,
    `¡Cita confirmada, ${name}!`,
    `<p style="margin:0 0 8px;">Te esperamos el <strong>${fmtWhen(startsAt)}</strong>.</p>
     <p style="margin:0 0 8px;">${service} con ${employee} · <strong>${Number(price).toFixed(2)} €</strong></p>
     <p style="margin:0;color:#8a7f78;font-size:14px;">Si no puedes venir, cancela tu cita desde la web (hasta ${BUSINESS.cancelMinHours} horas antes) o llámanos. Adjuntamos el evento para tu calendario.</p>`,
    attachments
  );
}

export async function sendBookingUpdate(to, data) {
  const { startsAt } = data;
  const name = escapeHtml(data.name);
  const service = escapeHtml(data.service);
  const employee = escapeHtml(data.employee);
  return sendEmail(
    to,
    `🔁 Tu cita ha cambiado — ${fmtWhen(startsAt)}`,
    `Tu cita ha sido actualizada, ${name}`,
    `<p style="margin:0 0 8px;">Tu nueva cita es el <strong>${fmtWhen(startsAt)}</strong>.</p>
     <p style="margin:0 0 8px;">${service} con ${employee}</p>
     <p style="margin:0;color:#8a7f78;font-size:14px;">Si no te viene bien, llámanos y buscamos otro hueco.</p>`
  );
}

export async function sendReminder(to, data) {
  const { startsAt } = data;
  const name = escapeHtml(data.name);
  const service = escapeHtml(data.service);
  const employee = escapeHtml(data.employee);
  return sendEmail(
    to,
    `⏰ Recordatorio: tu cita es mañana — ${fmtWhen(startsAt)}`,
    `¡Te esperamos mañana, ${name}!`,
    `<p style="margin:0 0 8px;">Tienes cita el <strong>${fmtWhen(startsAt)}</strong>.</p>
     <p style="margin:0 0 8px;">${service} con ${employee}</p>
     <p style="margin:0;color:#8a7f78;font-size:14px;">Si no puedes venir, cancela desde la web o llámanos — así el hueco lo aprovecha otro cliente.</p>`
  );
}
