
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

/* =========================================================
   CLIENTE SUPABASE AUTENTICADO
========================================================= */

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
    },
  );
}

/* =========================================================
   VALIDAR USUARIO MENTEE
========================================================= */

async function getMentee(request: Request) {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const db = getDatabase(
    authorization.slice(7).trim(),
  );

  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();

  if (userError || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: profile, error } = await db
    .from("profiles")
    .select("id, email, rol, activo")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new Error("UNAUTHORIZED");
  }

  if (profile.rol !== "mentee" || !profile.activo) {
    throw new Error("FORBIDDEN");
  }

  return { db, profile };
}

/* =========================================================
   VALIDAR QUE LA RESERVA PERTENEZCA AL MENTEE
========================================================= */

async function assertMenteeBooking(
  email: string,
  bookingId: string,
) {
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

  const belongsToMentee =
    appointment.customers?.some(
      (customer) =>
        customer.emailAddress
          ?.trim()
          .toLowerCase() ===
        email.trim().toLowerCase(),
    );

  if (!belongsToMentee) {
    throw new Error("FORBIDDEN");
  }
}

/* =========================================================
   RESPUESTAS DE ERROR
========================================================= */

function errorResponse(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Error interno.";

  const status =
    message === "UNAUTHORIZED"
      ? 401
      : message === "FORBIDDEN"
        ? 403
        : 500;

  return NextResponse.json(
    {
      error:
        message === "UNAUTHORIZED"
          ? "No autenticado."
          : message === "FORBIDDEN"
            ? "No tienes permiso para ver los acuerdos de esta mentoría."
            : message,
    },
    { status },
  );
}

/* =========================================================
   GET - CONSULTAR ACUERDOS DEL MENTEE
   Incluye los enlaces registrados por el mentor
========================================================= */

export async function GET(request: Request) {
  try {
    const rawBookingId =
      new URL(request.url).searchParams.get(
        "bookingId",
      ) ?? "";

    const bookingId =
      decodeURIComponent(rawBookingId);

    if (!bookingId) {
      return NextResponse.json(
        {
          error: "bookingId es obligatorio.",
        },
        { status: 400 },
      );
    }

    const { db, profile } =
      await getMentee(request);

    await assertMenteeBooking(
      profile.email,
      bookingId,
    );

    const { data, error } = await db
      .from("acuerdos")
      .select(
        `
          id,
          titulo,
          descripcion,
          observacion,
          estado,
          fecha_limite,
          enlaces,
          cumplido_at,
          created_at,
          updated_at
        `,
      )
      .eq("microsoft_booking_id", bookingId)
      .eq("responsable_id", profile.id)
      .order("created_at");

    if (error) {
      throw error;
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

/* =========================================================
   PATCH - NO PERMITIDO PARA EL MENTEE

   El estado de los acuerdos es gestionado
   exclusivamente por el mentor.
========================================================= */

export async function PATCH(request: Request) {
  try {
    await getMentee(request);

    return NextResponse.json(
      {
        error:
          "El estado de los acuerdos solo puede ser modificado por el mentor.",
      },
      { status: 403 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
