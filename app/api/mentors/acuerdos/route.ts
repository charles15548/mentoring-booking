import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";
import { supabaseAdmin } from "@/lib/supabase-admin";

function getDatabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

// function getBookingStartTime(dateTime?: string, timeZone?: string) {
//   if (!dateTime) return Number.NaN;

//   if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(dateTime)) {
//     return new Date(dateTime).getTime();
//   }

//   const utcTime = new Date(`${dateTime}Z`).getTime();

//   // Microsoft Bookings usa "SA Pacific Standard Time" para Perú (UTC-5).
//   return timeZone === "SA Pacific Standard Time"
//     ? utcTime + 5 * 60 * 60 * 1000
//     : utcTime;
// }

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

  if (userError || !user) throw new Error("UNAUTHORIZED");

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, rol, activo, microsoft_staff_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) throw new Error("UNAUTHORIZED");
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
  db: ReturnType<typeof getDatabase>,
  staffId: string,
  bookingId: string,
) {
  const businessId = getBookingBusinessId();
  const appointment = await graphRequest<{
    id: string;
    staffMemberIds?: string[];
    startDateTime?: { dateTime?: string; timeZone?: string };
  }>(
    `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}/appointments/${encodeURIComponent(bookingId)}`,
  );

  if (!appointment.staffMemberIds?.includes(staffId)) {
    throw new Error("FORBIDDEN");
  }

//   const { data: confirmation, error } = await db
//     .from("appointment_confirmations")
//     .select("status")
//     .eq("microsoft_booking_id", bookingId)
//     .maybeSingle();

//   if (error) throw error;
 

//   if (
//     confirmation?.status?.toLowerCase() !== "confirmada" 
//   ) {
//     throw new Error("NOT_COMPLETED");
//   }
}

async function getMenteeIdForBooking(bookingId: string) {
  const businessId = getBookingBusinessId();
  const appointment = await graphRequest<{ customers?: Array<{ emailAddress?: string }> }>(
    `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}/appointments/${encodeURIComponent(bookingId)}`,
  );
  const email = appointment.customers?.[0]?.emailAddress?.trim().toLowerCase();
  if (!email) throw new Error("No se encontró el mentee de la mentoría.");
  const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("email", email).eq("rol", "mentee").single();
  if (error || !data) throw new Error("No se encontró el perfil del mentee.");
  return data.id;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Error interno.";
  const status =
    message === "UNAUTHORIZED"
      ? 401
      : message === "FORBIDDEN"
        ? 403
        : message === "NOT_COMPLETED"
          ? 409
          : 500;
  const errorMessage =
    message === "UNAUTHORIZED"
      ? "No autenticado."
      : message === "FORBIDDEN"
        ? "No tienes permiso para gestionar acuerdos de esta mentoría."
        : message === "NOT_COMPLETED"
          ? "Solo puedes gestionar acuerdos de mentorías realizadas."
          : message;

  return NextResponse.json({ error: errorMessage }, { status });
}

export async function GET(request: Request) {
  try {
    const bookingIdRaw = new URL(request.url).searchParams.get("bookingId")??"";

    const bookingId = decodeURIComponent(bookingIdRaw);
    if (!bookingId)
      return NextResponse.json(
        { error: "bookingId es obligatorio." },
        { status: 400 },
      );

    const { db, profile } = await getMentor(request);
    await assertCompletedMentorship(db, profile.microsoft_staff_id, bookingId);

    const { data, error } = await db
      .from("acuerdos")
      .select(
        "id, titulo, descripcion, observacion, estado, fecha_limite, cumplido_at, created_at, updated_at",
      )
      .eq("microsoft_booking_id", bookingId)
      .order("created_at");

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

// export async function POST(request: Request) {
//   try {
//     const body = await request.json();
//     const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
//     const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";

//     if (!bookingId || !titulo)
//       return NextResponse.json(
//         { error: "La mentoría y el título son obligatorios." },
//         { status: 400 },
//       );

//     const { db, profile, user } = await getMentor(request);
//     await assertCompletedMentorship(db, profile.microsoft_staff_id, bookingId);

//     const { data, error } = await db
//       .from("acuerdos")
//       .insert({
//         microsoft_booking_id: bookingId,
//         creado_por: user.id,
//         titulo,
//         descripcion:
//           typeof body.descripcion === "string"
//             ? body.descripcion.trim() || null
//             : null,
//         observacion:
//           typeof body.observacion === "string"
//             ? body.observacion.trim() || null
//             : null,
//         fecha_limite:
//           typeof body.fecha_limite === "string" && body.fecha_limite
//             ? body.fecha_limite
//             : null,
//       })
//       .select(
//         "id, titulo, descripcion, observacion, estado, fecha_limite, cumplido_at, created_at, updated_at",
//       )
//       .single();

//     if (error) throw error;
//     return NextResponse.json(data, { status: 201 });
//   } catch (error) {
//     return errorResponse(error);
//   }
// }

 
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const bookingIdRaw = typeof body.bookingId === "string"
    ? body.bookingId
    : "";

    const bookingId = decodeURIComponent(bookingIdRaw);

    const titulo =
      typeof body.titulo === "string"
        ? body.titulo.trim()
        : "";

    console.log("[acuerdos POST] Inicio", {
      bookingId,
      titulo,
      tieneDescripcion: typeof body.descripcion === "string",
      tieneObservacion: typeof body.observacion === "string",
      fechaLimite: body.fecha_limite ?? null,
    });

    if (!bookingId || !titulo) {
      console.warn("[acuerdos POST] Datos obligatorios faltantes", {
        bookingId,
        titulo,
      });

      return NextResponse.json(
        { error: "La mentoría y el título son obligatorios." },
        { status: 400 },
      );
    }

    const { db, profile, user } = await getMentor(request);

    console.log("[acuerdos POST] Mentor validado", {
      userId: user.id,
      staffId: profile.microsoft_staff_id,
      rol: profile.rol,
    });

    await assertCompletedMentorship(
      db,
      profile.microsoft_staff_id,
      bookingId,
    );

    const responsableId = await getMenteeIdForBooking(bookingId);

    console.log(
      "[acuerdos POST] Mentoría validada como realizada",
      { bookingId },
    );

    const agreementToInsert = {
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
        typeof body.fecha_limite === "string" &&
        body.fecha_limite
          ? body.fecha_limite
          : null,
    };

    console.log(
      "[acuerdos POST] Insertando acuerdo",
      agreementToInsert,
    );

    const { data, error } = await db
      .from("acuerdos")
      .insert(agreementToInsert)
      .select(
        "id, titulo, descripcion, observacion, estado, fecha_limite, cumplido_at, created_at, updated_at",
      )
      .single();

    if (error) {
      console.error(
        "[acuerdos POST] Error de Supabase al insertar",
        {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
      );

      return NextResponse.json(
        {
          error: "No se pudo crear el acuerdo.",
          details: error.message,
          code: error.code,
          hint: error.hint,
        },
        { status: 500 },
      );
    }

    console.log("[acuerdos POST] Acuerdo creado", {
      agreementId: data.id,
      bookingId,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[acuerdos POST] Error no controlado", error);

    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.id !== "string")
      return NextResponse.json(
        { error: "El acuerdo es obligatorio." },
        { status: 400 },
      );

    const { db, profile } = await getMentor(request);
    const { data: agreement, error: findError } = await db
      .from("acuerdos")
      .select("microsoft_booking_id")
      .eq("id", body.id)
      .single();
    if (findError || !agreement)
      return NextResponse.json(
        { error: "Acuerdo no encontrado." },
        { status: 404 },
      );

    await assertCompletedMentorship(
      db,
      profile.microsoft_staff_id,
      agreement.microsoft_booking_id,
    );
    const update: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };
    for (const field of [
      "titulo",
      "descripcion",
      "observacion",
      "estado",
      "fecha_limite",
    ] as const) {
      if (field in body)
        update[field] =
          typeof body[field] === "string" ? body[field].trim() || null : null;
    }
    if (
      update.titulo === null ||
      (update.estado &&
        !["pendiente", "en_progreso", "cumplido", "cancelado"].includes(
          update.estado,
        ))
    ) {
      return NextResponse.json(
        { error: "Los datos del acuerdo no son válidos." },
        { status: 400 },
      );
    }
    if (update.estado === "cumplido")
      update.cumplido_at = new Date().toISOString();
    if (update.estado && update.estado !== "cumplido")
      update.cumplido_at = null;

    const { data, error } = await db
      .from("acuerdos")
      .update(update)
      .eq("id", body.id)
      .select(
        "id, titulo, descripcion, observacion, estado, fecha_limite, cumplido_at, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id)
      return NextResponse.json(
        { error: "El acuerdo es obligatorio." },
        { status: 400 },
      );

    const { db, profile } = await getMentor(request);
    const { data: agreement, error: findError } = await db
      .from("acuerdos")
      .select("microsoft_booking_id")
      .eq("id", id)
      .single();
    if (findError || !agreement)
      return NextResponse.json(
        { error: "Acuerdo no encontrado." },
        { status: 404 },
      );

    await assertCompletedMentorship(
      db,
      profile.microsoft_staff_id,
      agreement.microsoft_booking_id,
    );
    const { error } = await db.from("acuerdos").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
