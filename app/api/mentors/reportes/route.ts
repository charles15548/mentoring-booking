
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { GET as consultarReporte } from "./consulta/route";
import { generarPdfMentoria } from "@/lib/mentor-report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "reportes-mentoria";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Falta configurar Supabase en el servidor.",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function authClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function getUser(request: Request) {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice(7).trim();

  if (!token) return null;

  const db = authClient();

  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  if (error || !user) return null;

  return { user, token };
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T12:00:00Z`);

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

async function signedDownload(
  storage: ReturnType<typeof adminClient>,
  filePath: string,
  from: string,
  to: string,
) {
  const filename =
    `reporte-mentorias-${from}-${to}.pdf`;

  const { data, error } = await storage.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60, {
      download: filename,
    });

  if (error || !data?.signedUrl) {
    throw new Error(
      "No se pudo generar el enlace de descarga.",
    );
  }

  return data.signedUrl;
}

/* =====================================================
   GET
   HISTORIAL Y DESCARGA DE UN REPORTE
===================================================== */

export async function GET(request: Request) {
  try {
    const identity = await getUser(request);

    if (!identity) {
      return fail(
        "La sesión no es válida o ha expirado.",
        401,
      );
    }

    const db = adminClient();
    const url = new URL(request.url);

    const reportId =
      url.searchParams.get("id");

    if (reportId) {
      const { data: report, error } = await db
        .from("reportes_mentoria")
        .select(
          "id, mentor_id, fecha_inicio, fecha_fin, archivo_ruta",
        )
        .eq("id", reportId)
        .eq("mentor_id", identity.user.id)
        .maybeSingle();

      if (error) {
        return fail(
          "No se pudo consultar el reporte.",
          500,
        );
      }

      if (!report) {
        return fail(
          "No se encontró el reporte solicitado.",
          404,
        );
      }

      if (!report.archivo_ruta) {
        return fail(
          "Este reporte no tiene un PDF disponible.",
          404,
        );
      }

      const url = await signedDownload(
        db,
        report.archivo_ruta,
        report.fecha_inicio,
        report.fecha_fin,
      );

      return NextResponse.json({ url });
    }

    const { data, error } = await db
      .from("reportes_mentoria")
      .select(
        "id, fecha_inicio, fecha_fin, tipo_periodo, version, total_mentorias, total_acuerdos, acuerdos_cumplidos, acuerdos_pendientes, acuerdos_en_progreso, acuerdos_cancelados, fecha_generacion, archivo_ruta",
      )
      .eq("mentor_id", identity.user.id)
      .order("fecha_generacion", {
        ascending: false,
      })
      .limit(100);

    if (error) {
      console.error(
        "Error consultando historial:",
        error,
      );

      return fail(
        "No se pudo consultar el historial.",
        500,
      );
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error(error);

    return fail(
      "No se pudo consultar el historial.",
      500,
    );
  }
}

/* =====================================================
   POST
   GENERAR Y GUARDAR PDF
===================================================== */

export async function POST(request: Request) {
  try {
    const identity = await getUser(request);

    if (!identity) {
      return fail(
        "La sesión no es válida o ha expirado.",
        401,
      );
    }

    const input: unknown = await request.json();

    if (!input || typeof input !== "object") {
      return fail("Datos inválidos.", 400);
    }

    const body = input as Record<string, unknown>;

    const desde =
      typeof body.desde === "string"
        ? body.desde
        : "";

    const hasta =
      typeof body.hasta === "string"
        ? body.hasta
        : "";

    const tipoPeriodo =
      body.tipoPeriodo === "personalizado"
        ? "personalizado"
        : "mensual";

    if (
      !validDate(desde) ||
      !validDate(hasta) ||
      desde > hasta
    ) {
      return fail(
        "Selecciona un período válido.",
        400,
      );
    }

    /* ======================================
       CONSULTA AUTORIZADA Y ACTUALIZADA
    ====================================== */

    const consultationUrl = new URL(
      "/api/mentors/reportes/consulta",
      request.url,
    );

    consultationUrl.searchParams.set(
      "desde",
      desde,
    );

    consultationUrl.searchParams.set(
      "hasta",
      hasta,
    );

    const consultationRequest = new Request(
      consultationUrl.toString(),
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${identity.token}`,
        },
      },
    );

    // Reutiliza el mismo procedimiento de
    // validación de mentor, fechas y acuerdos
    // del endpoint /consulta existente.
    const consultationResponse =
      await consultarReporte(consultationRequest);

    const consultationData =
      await consultationResponse.json();

    if (!consultationResponse.ok) {
      return NextResponse.json(
        consultationData,
        {
          status: consultationResponse.status,
        },
      );
    }

    const report = consultationData as {
      mentor: { id: string; nombre: string };
      periodo: {
        desde: string;
        hasta: string;
      };
      totales: {
        totalMentorias: number;
        totalAcuerdos: number;
        cumplidos: number;
        pendientes: number;
        enProgreso: number;
        cancelados: number;
      };
      sesiones: Array<{
        bookingId: string;
        fecha: string | null;
        servicio: string;
        mentee: {
          nombre: string;
          email: string;
          fotoUrl: string | null;
        };
        acuerdos: Array<{
          id: string;
          titulo: string;
          descripcion: string | null;
          observacion: string | null;
          estado: string;
          fechaLimite: string | null;
        }>;
      }>;
    };

    if (report.mentor.id !== identity.user.id) {
      return fail("Acceso denegado.", 403);
    }

    if (report.totales.totalMentorias === 0) {
      return fail(
        "No hay mentorías realizadas para generar este reporte.",
        400,
      );
    }

    /* ======================================
       GENERAR DOCUMENTO
    ====================================== */

    const pdfBytes =
      await generarPdfMentoria(report);

    const db = adminClient();

    /* ======================================
       GUARDAR NUEVA VERSIÓN
    ====================================== */

    for (let attempt = 0; attempt < 4; attempt++) {
      const {
        data: lastVersion,
        error: versionError,
      } = await db
        .from("reportes_mentoria")
        .select("version")
        .eq("mentor_id", identity.user.id)
        .eq("fecha_inicio", desde)
        .eq("fecha_fin", hasta)
        .order("version", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (versionError) {
        return fail(
          "No se pudo calcular la versión del reporte.",
          500,
        );
      }

      const version =
        (lastVersion?.version ?? 0) + 1;

      const reportId = randomUUID();

      const filePath =
        `${identity.user.id}/` +
        `${desde}_${hasta}/` +
        `${reportId}.pdf`;

      const { error: uploadError } =
        await db.storage
          .from(BUCKET)
          .upload(
            filePath,
            Buffer.from(pdfBytes),
            {
              contentType: "application/pdf",
              upsert: false,
            },
          );

      if (uploadError) {
        console.error(uploadError);

        return fail(
          "No se pudo almacenar el PDF.",
          500,
        );
      }

      const { error: insertError } = await db
        .from("reportes_mentoria")
        .insert({
          id: reportId,
          mentor_id: identity.user.id,

          fecha_inicio: desde,
          fecha_fin: hasta,
          tipo_periodo: tipoPeriodo,
          version,

          total_mentorias:
            report.totales.totalMentorias,

          total_acuerdos:
            report.totales.totalAcuerdos,

          acuerdos_cumplidos:
            report.totales.cumplidos,

          acuerdos_pendientes:
            report.totales.pendientes,

          acuerdos_en_progreso:
            report.totales.enProgreso,

          acuerdos_cancelados:
            report.totales.cancelados,

          // Copia de los resultados de emisión.
          contenido: report,

          archivo_ruta: filePath,
        });

      if (insertError) {
        // Evitar dejar un archivo sin registro.
        const { error: cleanupError } =
          await db.storage
            .from(BUCKET)
            .remove([filePath]);

        if (cleanupError) {
          console.error(
            "No se pudo limpiar el PDF:",
            cleanupError,
          );
        }

        // Si se creó otra versión al mismo
        // tiempo, volver a calcularla.
        if (insertError.code === "23505") {
          continue;
        }

        console.error(insertError);

        return fail(
          "No se pudo guardar el reporte en el historial.",
          500,
        );
      }

      let url: string | null = null;

      try {
        url = await signedDownload(
          db,
          filePath,
          desde,
          hasta,
        );
      } catch (error) {
        console.error(
          "El reporte fue guardado, pero no se pudo generar el enlace:",
          error,
        );
      }

      return NextResponse.json(
        {
          message: "Reporte generado correctamente.",
          id: reportId,
          version,
          url,
        },
        { status: 201 },
      );
    }

    return fail(
      "No se pudo asignar una versión al reporte. Intenta nuevamente.",
      409,
    );
  } catch (error) {
    console.error(
      "Error generando reporte:",
      error,
    );

    return fail(
      error instanceof Error
        ? error.message
        : "No se pudo generar el PDF.",
      500,
    );
  }
}
