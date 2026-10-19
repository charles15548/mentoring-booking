import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";
import { supabaseAdmin } from "@/lib/supabase-admin";

function getDatabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

type Database = ReturnType<typeof getDatabase>;

const AGREEMENT_COLUMNS =
  "id, titulo, descripcion, observacion, estado, fecha_limite, enlaces, cumplido_at, created_at, updated_at";

const MAX_LINKS = 10;
const MAX_LINK_LENGTH = 2048;

function parseLinks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("INVALID_LINKS");
  }

  if (value.length > MAX_LINKS) {
    throw new Error("TOO_MANY_LINKS");
  }

  const unique = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error("INVALID_LINKS");
    }

    const link = entry.trim();

    if (!link || link.length > MAX_LINK_LENGTH) {
      throw new Error("INVALID_LINKS");
    }

    let parsed: URL;

    try {
      parsed = new URL(link);
    } catch {
      throw new Error("INVALID_LINKS");
    }

    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error("INVALID_LINKS");
    }

    unique.add(parsed.toString());
  }

  return Array.from(unique);
}

async function getMentor(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
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
    .select("id, rol, activo, microsoft_staff_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("UNAUTHORIZED");
  }

  if (
    profile.rol !== "mentor" ||
    !profile.activo ||
    !profile.microsoft_staff_id
  ) {
    throw new Error("FORBIDDEN");
  }

  return { db, profile, user };
}

async function assertCompletedMentorship(
  _db: Database,
  staffId: string,
  bookingId: string,
) {
  const businessId = getBookingBusinessId();

  const appointment = await graphRequest<{
    id: string;
    staffMemberIds?: string[];
    startDateTime?: {
      dateTime?: string;
      timeZone?: string;
    };
  }>(
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId,
    )}/appointments/${encodeURIComponent(bookingId)}`,
  );

  if (!appointment.staffMemberIds?.includes(staffId)) {
    throw new Error("FORBIDDEN");
  }

  // Se conserva el comportamiento de la API existente:
  // aquí se valida la pertenencia de la reserva al mentor.
}

async function getMenteeIdForBooking(bookingId: string) {
  const businessId = getBookingBusinessId();

  const appointment = await graphRequest<{
    customers?: Array<{
      emailAddress?: string;
    }>;
  }>(
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId,
    )}/appointments/${encodeURIComponent(bookingId)}`,
  );

  const email = appointment.customers?.[0]?.emailAddress?.trim().toLowerCase();

  if (!email) {
    throw new Error("No se encontró el mentee de la mentoría.");
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .eq("rol", "mentee")
    .single();

  if (error || !data) {
    throw new Error("No se encontró el perfil del mentee.");
  }

  return data.id;
}

function errorResponse(error: unknown) {
  console.error("Error en acuerdos:", error);

  const message = error instanceof Error ? error.message : "Error interno.";

  const messages: Record<string, string> = {
    UNAUTHORIZED: "No autenticado.",
    FORBIDDEN: "No tienes permiso para gestionar acuerdos de esta mentoría.",
    NOT_COMPLETED: "Solo puedes gestionar acuerdos de mentorías realizadas.",
    INVALID_LINKS:
      "Ingresa enlaces válidos que comiencen con http:// o https://.",
    TOO_MANY_LINKS: "Puedes registrar hasta 10 enlaces por acuerdo.",
  };

  const status =
    message === "UNAUTHORIZED"
      ? 401
      : message === "FORBIDDEN"
        ? 403
        : message === "NOT_COMPLETED"
          ? 409
          : ["INVALID_LINKS", "TOO_MANY_LINKS"].includes(message)
            ? 400
            : 500;

  return NextResponse.json({ error: messages[message] ?? message }, { status });
}

/* =========================================================
   GET - Consultar acuerdos de una mentoría
   ========================================================= */

export async function GET(request: Request) {
  try {
    const bookingId = new URL(request.url).searchParams
      .get("bookingId")
      ?.trim();

    if (!bookingId) {
      return NextResponse.json(
        { error: "bookingId es obligatorio." },
        { status: 400 },
      );
    }

    const { db, profile } = await getMentor(request);

    await assertCompletedMentorship(db, profile.microsoft_staff_id, bookingId);

    console.log("[ACUERDOS GET] Booking ID:", {
      valor: bookingId,
      longitud: bookingId.length,
      contienePorcentaje: bookingId.includes("%"),
    });

    const { data, error } = await db
      .from("acuerdos")
      .select(AGREEMENT_COLUMNS)
      .eq("microsoft_booking_id", bookingId)
      .order("created_at");

    console.log("[ACUERDOS GET] Resultado:", {
      cantidad: data?.length ?? 0,
      error: error?.message ?? null,
    });

    // Diagnóstico: comprobar coincidencia con el identificador original.
    const { data: visibles, error: visiblesError } = await db
      .from("acuerdos")
      .select("microsoft_booking_id")
      .limit(10);

    console.log("[ACUERDOS GET] Registros visibles:", {
      cantidad: visibles?.length ?? 0,
      identificadoresCoinciden:
        visibles?.filter((item) => item.microsoft_booking_id === bookingId)
          .length ?? 0,
      error: visiblesError?.message ?? null,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

/* =========================================================
   POST - Registrar acuerdo con enlaces
   ========================================================= */

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const bookingId =
      typeof body.bookingId === "string" ? body.bookingId.trim() : "";

    const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";

    if (!bookingId || !titulo) {
      return NextResponse.json(
        {
          error: "La mentoría y el título son obligatorios.",
        },
        { status: 400 },
      );
    }

    const enlaces = parseLinks(body.enlaces ?? []);

    const { db, profile, user } = await getMentor(request);

    await assertCompletedMentorship(db, profile.microsoft_staff_id, bookingId);

    const responsableId = await getMenteeIdForBooking(bookingId);

    const { data, error } = await db
      .from("acuerdos")
      .insert({
        microsoft_booking_id: bookingId,
        creado_por: user.id,
        responsable_id: responsableId,
        titulo,
        descripcion:
          typeof body.descripcion === "string"
            ? body.descripcion.trim() || null
            : null,
        observacion:
          typeof body.observacion === "string"
            ? body.observacion.trim() || null
            : null,
        fecha_limite:
          typeof body.fecha_limite === "string" && body.fecha_limite
            ? body.fecha_limite
            : null,
        enlaces,
      })
      .select(AGREEMENT_COLUMNS)
      .single();

    if (error) {
      console.error("Error insertando acuerdo:", error);
      throw error;
    }

    return NextResponse.json(data, {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/* =========================================================
   PATCH - Actualizar estado y otros campos del acuerdo
   ========================================================= */

export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    if (typeof body.id !== "string") {
      return NextResponse.json(
        { error: "El acuerdo es obligatorio." },
        { status: 400 },
      );
    }

    const { db, profile } = await getMentor(request);

    const { data: agreement, error: findError } = await db
      .from("acuerdos")
      .select("microsoft_booking_id")
      .eq("id", body.id)
      .single();

    if (findError || !agreement) {
      return NextResponse.json(
        { error: "Acuerdo no encontrado." },
        { status: 404 },
      );
    }

    await assertCompletedMentorship(
      db,
      profile.microsoft_staff_id,
      agreement.microsoft_booking_id,
    );

    const update: Record<string, string | string[] | null> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of [
      "titulo",
      "descripcion",
      "observacion",
      "estado",
      "fecha_limite",
    ] as const) {
      if (field in body) {
        update[field] =
          typeof body[field] === "string" ? body[field].trim() || null : null;
      }
    }

    if ("enlaces" in body) {
      update.enlaces = parseLinks(body.enlaces);
    }

    if (
      update.titulo === null ||
      (typeof update.estado === "string" &&
        !["pendiente", "en_progreso", "cumplido", "cancelado"].includes(
          update.estado,
        ))
    ) {
      return NextResponse.json(
        {
          error: "Los datos del acuerdo no son válidos.",
        },
        { status: 400 },
      );
    }

    if (update.estado === "cumplido") {
      update.cumplido_at = new Date().toISOString();
    }

    if (update.estado && update.estado !== "cumplido") {
      update.cumplido_at = null;
    }

    const { data, error } = await db
      .from("acuerdos")
      .update(update)
      .eq("id", body.id)
      .select(AGREEMENT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

/* =========================================================
   DELETE - Eliminar acuerdo
   ========================================================= */

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json(
        { error: "El acuerdo es obligatorio." },
        { status: 400 },
      );
    }

    const { db, profile } = await getMentor(request);

    const { data: agreement, error: findError } = await db
      .from("acuerdos")
      .select("microsoft_booking_id")
      .eq("id", id)
      .single();

    if (findError || !agreement) {
      return NextResponse.json(
        { error: "Acuerdo no encontrado." },
        { status: 404 },
      );
    }

    await assertCompletedMentorship(
      db,
      profile.microsoft_staff_id,
      agreement.microsoft_booking_id,
    );

    const { error } = await db.from("acuerdos").delete().eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
