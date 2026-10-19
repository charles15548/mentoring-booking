
import "server-only";

import nodemailer from "nodemailer";

import { supabaseAdmin } from "@/lib/supabase-admin";

import {
  crearCorreoMentoria,
  type MentoriaMailData,
} from "@/lib/mentoria-email-templates";

/* =========================================================
   TIPOS DE NOTIFICACIONES
========================================================= */

export type MentoriaEvent =
  | "solicitud-mentor"
  | "solicitud-mentee"
  | "confirmacion-mentee";

/* =========================================================
   CONFIGURACIÓN DE NOTIFICACIONES

   Permite activar o desactivar individualmente
   los tres correos institucionales.

   La variable principal funciona como
   interruptor general.
========================================================= */

function notificacionHabilitada(
  event: MentoriaEvent,
): boolean {
  if (
    process.env.PRUNI_NOTIFICACIONES_ACTIVAS !==
    "true"
  ) {
    return false;
  }

  switch (event) {
    case "solicitud-mentor":
      return (
        process.env.PRUNI_CORREO_SOLICITUD_MENTOR ===
        "true"
      );

    case "solicitud-mentee":
      return (
        process.env.PRUNI_CORREO_SOLICITUD_MENTEE ===
        "true"
      );

    case "confirmacion-mentee":
      return (
        process.env.PRUNI_CORREO_CONFIRMACION_MENTEE ===
        "true"
      );

    default:
      return false;
  }
}

/* =========================================================
   CONFIGURACIÓN SMTP

   Este SMTP es independiente de Supabase Auth.

   No modifica las plantillas de contraseñas
   ni la configuración SMTP de Supabase.
========================================================= */

function smtpConfig() {
  const host = process.env.PRUNI_SMTP_HOST;
  const user = process.env.PRUNI_SMTP_USER;
  const pass = process.env.PRUNI_SMTP_PASSWORD;
  const from = process.env.PRUNI_MAIL_FROM;

  const port = Number(
    process.env.PRUNI_SMTP_PORT || "465",
  );

  if (
    !host ||
    !user ||
    !pass ||
    !from ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    throw new Error(
      "Falta configurar correctamente el SMTP de notificaciones ProUni.",
    );
  }

  return {
    host,
    user,
    pass,
    from,
    port,
  };
}

/* =========================================================
   ENVIAR NOTIFICACIÓN DE MENTORÍA

   - Verifica si el tipo de correo está habilitado.
   - Evita duplicados por reserva y evento.
   - Envía el correo mediante SMTP.
   - Registra el resultado en Supabase.
   - No revierte la reserva si falla el correo.
========================================================= */

export async function notificarMentoria({
  bookingId,
  event,
  recipient,
  data,
}: {
  bookingId: string;
  event: MentoriaEvent;
  recipient: string;
  data: MentoriaMailData;
}): Promise<void> {
  /*
     1. VERIFICAR SI EL CORREO ESTÁ HABILITADO
  */

  if (!notificacionHabilitada(event)) {
    return;
  }

  /*
     2. VALIDAR DATOS
  */

  const email = recipient
    .trim()
    .toLowerCase();

  if (!bookingId.trim()) {
    console.error(
      "[correo-mentoria] Falta el identificador de la reserva.",
    );
    return;
  }

  if (!email) {
    console.error(
      `[correo-mentoria] Sin destinatario: ${event} / ${bookingId}`,
    );
    return;
  }

  /*
     3. REGISTRAR NOTIFICACIÓN EN SUPABASE

     La restricción UNIQUE de la tabla
     mentoria_notificaciones impide que
     una misma reserva genere dos correos
     del mismo tipo.
  */

  const {
    data: claimed,
    error: claimError,
  } = await supabaseAdmin
    .from("mentoria_notificaciones")
    .insert({
      microsoft_booking_id: bookingId,
      evento: event,
      destinatario: email,
      estado: "procesando",
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") {
      console.log(
        `[correo-mentoria] Notificación ya registrada: ${event} / ${bookingId}`,
      );
      return;
    }

    throw new Error(
      `No se pudo registrar la notificación: ${claimError.message}`,
    );
  }

  if (!claimed) {
    return;
  }

  /*
     4. ENVIAR CORREO
  */

  try {
    const config = smtpConfig();

    const template = crearCorreoMentoria(
      event,
      data,
    );

    const transport =
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

    const result = await transport.sendMail({
      from: config.from,
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    /*
       5. MARCAR COMO ENVIADO
    */

    const { error: updateError } =
      await supabaseAdmin
        .from("mentoria_notificaciones")
        .update({
          estado: "enviado",
          enviado_en:
            new Date().toISOString(),
          error: null,
        })
        .eq("id", claimed.id);

    if (updateError) {
      console.error(
        "[correo-mentoria] El SMTP aceptó el correo, pero no se pudo actualizar su estado:",
        updateError,
      );
    }

    console.log(
      "[correo-mentoria] Correo enviado:",
      {
        bookingId,
        evento: event,
        destinatario: email,
        messageId: result.messageId,
      },
    );
  } catch (error) {
    /*
       6. REGISTRAR ERROR SIN AFECTAR
          LA RESERVA DE MICROSOFT BOOKINGS
    */

    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido";

    console.error(
      `[correo-mentoria] Falló ${event} / ${bookingId}:`,
      message,
    );

    const { error: updateError } =
      await supabaseAdmin
        .from("mentoria_notificaciones")
        .update({
          estado: "fallido",
          error: message.slice(0, 1000),
        })
        .eq("id", claimed.id);

    if (updateError) {
      console.error(
        "[correo-mentoria] No se pudo registrar el error:",
        updateError,
      );
    }

    // La reserva o confirmación permanece registrada.
  }
}
