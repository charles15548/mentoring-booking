
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const BUCKET_NAME = "bucket";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

type DeleteEvidenceInput = {
  acuerdoId?: string;
  evidenciaId?: string;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getDatabase(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/* =====================================================
   AUTENTICACIÓN DEL MENTEE
===================================================== */

async function getMentee(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("NO_AUTH");
  }

  const token = authorization.slice(7).trim();

  const db = getDatabase(token);

  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser(token);

  if (userError || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, email, rol, activo")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    profile.rol !== "mentee" ||
    profile.activo !== true
  ) {
    throw new Error("FORBIDDEN");
  }

  return profile;
}

/* =====================================================
   VALIDAR QUE EL ACUERDO PERTENECE AL MENTEE
===================================================== */

async function verificarAcuerdo(
  acuerdoId: string,
  menteeId: string,
) {
  const { data: acuerdo, error } = await supabaseAdmin
    .from("acuerdos")
    .select("id, responsable_id")
    .eq("id", acuerdoId)
    .eq("responsable_id", menteeId)
    .maybeSingle();

  if (error || !acuerdo) {
    return null;
  }

  return acuerdo;
}

/* =====================================================
   MANEJO DE ERRORES
===================================================== */

function handleError(error: unknown, method: string) {
  console.error(
    `Error en ${method} /api/mentee/evidencias:`,
    error,
  );

  if (error instanceof Error) {
    if (error.message === "NO_AUTH") {
      return errorResponse("No hay sesión activa.", 401);
    }

    if (error.message === "UNAUTHORIZED") {
      return errorResponse("Sesión no válida.", 401);
    }

    if (error.message === "FORBIDDEN") {
      return errorResponse("No tienes permisos.", 403);
    }
  }

  return errorResponse("Error interno del servidor.", 500);
}

/* =====================================================
   GET - LISTAR EVIDENCIAS DE UN ACUERDO
===================================================== */

export async function GET(request: NextRequest) {
  try {
    const mentee = await getMentee(request);

    const acuerdoId = request.nextUrl.searchParams
      .get("acuerdoId")
      ?.trim();

    if (!acuerdoId) {
      return errorResponse("Falta el acuerdoId.", 400);
    }

    const acuerdo = await verificarAcuerdo(
      acuerdoId,
      mentee.id,
    );

    if (!acuerdo) {
      return errorResponse(
        "No tienes acceso a este acuerdo.",
        403,
      );
    }

    const {
      data: evidencias,
      error: evidenciasError,
    } = await supabaseAdmin
      .from("evidencias")
      .select(
        "id, acuerdo_id, nombre_archivo, ruta_archivo, tipo_archivo, tamano, created_at",
      )
      .eq("acuerdo_id", acuerdoId)
      .order("created_at", { ascending: false });

    if (evidenciasError) {
      console.error(
        "Error obteniendo evidencias:",
        evidenciasError,
      );

      return errorResponse(
        "No se pudieron obtener las evidencias.",
        500,
      );
    }

    return NextResponse.json(evidencias ?? []);
  } catch (error) {
    return handleError(error, "GET");
  }
}

/* =====================================================
   POST - SUBIR UNA NUEVA EVIDENCIA
===================================================== */

export async function POST(request: NextRequest) {
  try {
    const mentee = await getMentee(request);

    const formData = await request.formData();

    const acuerdoId = formData.get("acuerdoId");
    const file = formData.get("file");

    if (
      typeof acuerdoId !== "string" ||
      !acuerdoId.trim()
    ) {
      return errorResponse("Falta el acuerdoId.", 400);
    }

    if (!(file instanceof File)) {
      return errorResponse(
        "No se recibió ningún archivo.",
        400,
      );
    }

    if (file.size === 0) {
      return errorResponse(
        "El archivo está vacío.",
        400,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(
        "El archivo supera el límite de 50 MB.",
        400,
      );
    }

    const acuerdo = await verificarAcuerdo(
      acuerdoId,
      mentee.id,
    );

    if (!acuerdo) {
      return errorResponse(
        "No tienes acceso a este acuerdo.",
        403,
      );
    }

    const nombreSeguro = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );

    // UUID para evitar colisiones de nombres.
    const ruta = `${acuerdoId}/${randomUUID()}-${nombreSeguro}`;

    const archivo = Buffer.from(
      await file.arrayBuffer(),
    );

    const { error: uploadError } =
      await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(ruta, archivo, {
          contentType:
            file.type || "application/octet-stream",
          upsert: false,
        });

    if (uploadError) {
      console.error(
        "Error subiendo archivo:",
        uploadError,
      );

      return errorResponse(
        "No se pudo subir el archivo.",
        500,
      );
    }

    const {
      data: evidencia,
      error: evidenciaError,
    } = await supabaseAdmin
      .from("evidencias")
      .insert({
        acuerdo_id: acuerdoId,
        nombre_archivo: file.name,
        ruta_archivo: ruta,
        tipo_archivo: file.type || null,
        tamano: file.size,
      })
      .select(
        "id, acuerdo_id, nombre_archivo, ruta_archivo, tipo_archivo, tamano, created_at",
      )
      .single();

    if (evidenciaError) {
      console.error(
        "Error registrando evidencia:",
        evidenciaError,
      );

      await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([ruta]);

      return errorResponse(
        "No se pudo registrar la evidencia.",
        500,
      );
    }

    return NextResponse.json(evidencia, {
      status: 201,
    });
  } catch (error) {
    return handleError(error, "POST");
  }
}

/* =====================================================
   DELETE - ELIMINAR EVIDENCIA ENVIADA
===================================================== */

export async function DELETE(request: NextRequest) {
  try {
    /* 1. Validar al mentee autenticado */

    const mentee = await getMentee(request);

    /* 2. Obtener los identificadores */

    const body: DeleteEvidenceInput =
      await request.json().catch(() => ({}));

    const acuerdoId = body.acuerdoId?.trim();
    const evidenciaId = body.evidenciaId?.trim();

    if (!acuerdoId || !evidenciaId) {
      return errorResponse(
        "Faltan los datos de la evidencia.",
        400,
      );
    }

    /* 3. Verificar propiedad del acuerdo */

    const acuerdo = await verificarAcuerdo(
      acuerdoId,
      mentee.id,
    );

    if (!acuerdo) {
      return errorResponse(
        "No tienes permisos para eliminar esta evidencia.",
        403,
      );
    }

    /* 4. Obtener la evidencia real desde la BD */

    const {
      data: evidencia,
      error: evidenciaError,
    } = await supabaseAdmin
      .from("evidencias")
      .select(
        "id, acuerdo_id, nombre_archivo, ruta_archivo",
      )
      .eq("id", evidenciaId)
      .eq("acuerdo_id", acuerdoId)
      .maybeSingle();

    if (evidenciaError) {
      console.error(
        "Error consultando evidencia:",
        evidenciaError,
      );

      return errorResponse(
        "No se pudo verificar la evidencia.",
        500,
      );
    }

    if (!evidencia) {
      return errorResponse(
        "La evidencia no existe o no pertenece a este acuerdo.",
        404,
      );
    }

    /* 5. Comprobar que la ruta está dentro
          del directorio del acuerdo */

    const ruta = evidencia.ruta_archivo;

    if (
      !ruta ||
      !ruta.startsWith(`${acuerdoId}/`) ||
      ruta === `${acuerdoId}/`
    ) {
      console.error(
        "Ruta de evidencia inesperada:",
        evidenciaId,
      );

      return errorResponse(
        "No se pudo validar el archivo.",
        500,
      );
    }

    /* 6. Eliminar el archivo de Storage */

    const { error: storageError } =
      await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([ruta]);

    if (storageError) {
      console.error(
        "Error eliminando archivo de Storage:",
        storageError,
      );

      return errorResponse(
        "No se pudo eliminar el archivo.",
        500,
      );
    }

    /* 7. Eliminar el registro de la evidencia */

    const {
      data: deleted,
      error: deleteError,
    } = await supabaseAdmin
      .from("evidencias")
      .delete()
      .eq("id", evidenciaId)
      .eq("acuerdo_id", acuerdoId)
      .select("id");

    if (deleteError || !deleted?.length) {
      console.error(
        "Error eliminando registro de evidencia:",
        deleteError,
      );

      return errorResponse(
        "No se pudo completar la eliminación. Contacta al administrador.",
        500,
      );
    }

    /* 8. Confirmación */

    return NextResponse.json({
      success: true,
      message: "Evidencia eliminada correctamente.",
      evidenciaId,
    });
  } catch (error) {
    return handleError(error, "DELETE");
  }
}
