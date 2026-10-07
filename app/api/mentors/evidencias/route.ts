import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  graphRequest,
  getBookingBusinessId,
} from "@/lib/microsoft-graph";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const BUCKET_NAME = "bucket";

function getDatabase(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function getMentor(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("NO_AUTH");
  }

  const token = authorization.replace("Bearer ", "").trim();

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

  if (
    profileError ||
    !profile ||
    profile.rol !== "mentor" ||
    profile.activo !== true ||
    !profile.microsoft_staff_id
  ) {
    throw new Error("FORBIDDEN");
  }

  return profile;
}

/**
 * Comprueba que el acuerdo pertenece a una mentoría
 * en la que participa el Mentor actual.
 */
async function verificarAcuerdoDelMentor(
  acuerdoId: string,
  staffId: string,
) {
  const { data: acuerdo, error: acuerdoError } =
    await supabaseAdmin
      .from("acuerdos")
      .select("id, microsoft_booking_id")
      .eq("id", acuerdoId)
      .single();

  if (acuerdoError || !acuerdo) {
    return null;
  }

  if (!acuerdo.microsoft_booking_id) {
    return null;
  }

  const businessId = getBookingBusinessId();

  const appointment = await graphRequest<{
    staffMemberIds?: string[];
  }>(
    `/solutions/bookingBusinesses/${businessId}/appointments/${acuerdo.microsoft_booking_id}`,
  );

  const staffMemberIds = appointment.staffMemberIds ?? [];

  if (!staffMemberIds.includes(staffId)) {
    return null;
  }

  return acuerdo;
}

/**
 * GET
 *
 * Obtiene las evidencias de un acuerdo específico.
 *
 * Ejemplo:
 * /api/mentors/evidencias?acuerdoId=...
 */
export async function GET(request: NextRequest) {
  try {
    const mentor = await getMentor(request);

    const acuerdoId =
      request.nextUrl.searchParams.get("acuerdoId");

    if (!acuerdoId) {
      return NextResponse.json(
        { error: "Falta el acuerdoId." },
        { status: 400 },
      );
    }

    const acuerdo = await verificarAcuerdoDelMentor(
      acuerdoId,
      mentor.microsoft_staff_id,
    );

    if (!acuerdo) {
      return NextResponse.json(
        { error: "No tienes acceso a este acuerdo." },
        { status: 403 },
      );
    }

    const { data: evidencias, error: evidenciasError } =
      await supabaseAdmin
        .from("evidencias")
        .select(
          "id, acuerdo_id, nombre_archivo, ruta_archivo, tipo_archivo, tamano, created_at",
        )
        .eq("acuerdo_id", acuerdoId)
        .order("created_at", { ascending: false });

    if (evidenciasError) {
      console.error(
        "Error obteniendo evidencias del Mentor:",
        evidenciasError,
      );

      return NextResponse.json(
        { error: "No se pudieron obtener las evidencias." },
        { status: 500 },
      );
    }

    const evidenciasConUrl = (evidencias ?? []).map(
      (evidencia) => {
        const { data } = supabaseAdmin.storage
          .from(BUCKET_NAME)
          .getPublicUrl(evidencia.ruta_archivo);

        return {
          ...evidencia,
          url: data.publicUrl,
        };
      },
    );

    return NextResponse.json(evidenciasConUrl);
  } catch (error) {
    console.error(
      "Error en GET /api/mentors/evidencias:",
      error,
    );

    if (error instanceof Error) {
      if (error.message === "NO_AUTH") {
        return NextResponse.json(
          { error: "No hay sesión activa." },
          { status: 401 },
        );
      }

      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json(
          { error: "Sesión no válida." },
          { status: 401 },
        );
      }

      if (error.message === "FORBIDDEN") {
        return NextResponse.json(
          { error: "No tienes permisos." },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 },
    );
  }
}

