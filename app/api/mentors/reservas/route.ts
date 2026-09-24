 
 

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";

function createAuthenticatedSupabase(token: string) {
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

/* =========================================================
   GET
   El mentor consulta SUS mentorías
   ========================================================= */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No se encontró la sesión activa." },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7).trim();

    const db = createAuthenticatedSupabase(token);

    /* =====================================================
       VALIDAR USUARIO
       ===================================================== */
    const {
      data: { user },
      error: userError,
    } = await db.auth.getUser(token);

    if (userError || !user) {
      console.error("Error validando usuario:", userError);

      return NextResponse.json(
        {
          error: "La sesión no es válida o ha expirado.",
          details: userError?.message,
        },
        { status: 401 },
      );
    }

    /* =====================================================
       PERFIL
       ===================================================== */
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select(
        "id, nombres, apellidos, email, rol, microsoft_staff_id, microsoft_email",
      )
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("Error obteniendo perfil:", profileError);

      return NextResponse.json(
        {
          error: "No se pudo obtener el perfil del mentor.",
          details: profileError?.message,
        },
        { status: 404 },
      );
    }

    /* =====================================================
       MICROSOFT BOOKINGS
       ===================================================== */
    const businessId = getBookingBusinessId();

    const appointmentsData = await graphRequest<{
      value?: Array<{
        id: string;
        serviceName?: string;
        staffMemberIds?: string[];
        startDateTime?: {
          dateTime: string;
        };
        endDateTime?: {
          dateTime: string;
        };
        onlineMeetingUrl?: string;
        customers?: Array<{
          name?: string;
          emailAddress?: string;
        }>;
      }>;
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/appointments`,
    );

    const allAppointments = appointmentsData.value ?? [];

    /* =====================================================
       FILTRAR CITAS DEL MENTOR
       ===================================================== */
    const mentorMentorships =
      profile.rol === "coordinador"
        ? allAppointments
        : allAppointments.filter((appointment) =>
            appointment.staffMemberIds?.includes(profile.microsoft_staff_id!),
          );

    if (mentorMentorships.length === 0) {
      return NextResponse.json([]);
    }

    /* =====================================================
       CONFIRMACIONES
       ===================================================== */
    const bookingIds = mentorMentorships.map((appointment) => appointment.id);

    const { data: confirmations, error: confirmationsError } = await db
      .from("appointment_confirmations")
      .select("microsoft_booking_id, confirmed, confirmed_at, confirmed_by, status")
      .in("microsoft_booking_id", bookingIds);

    const confirmationMap: Record<
      string,
      {
        confirmed: boolean;
        confirmed_at: string | null;
        confirmed_by: string | null;
        status: string | null;
      }
    > = {};

    for (const confirmation of confirmations ?? []) {
      confirmationMap[confirmation.microsoft_booking_id] = confirmation;
    }

    /* =====================================================
       RESPUESTA PARA EL FRONTEND
       ===================================================== */
    const mentorships = mentorMentorships.map((appointment) => {
      const confirmation = confirmationMap[appointment.id];

      const customer = appointment.customers?.[0];

      return {
        id: appointment.id,
        serviceName: appointment.serviceName ?? "Sesión de mentoría",
        menteeName: customer?.name ?? "Mentee PROUNI",
        menteeEmail: customer?.emailAddress ?? null,
        startDateTime: appointment.startDateTime,
        endDateTime: appointment.endDateTime,
        onlineMeetingUrl: appointment.onlineMeetingUrl ?? null,
        confirmed: confirmation?.confirmed ?? false,
        confirmedAt: confirmation?.confirmed_at ?? null,
        status: confirmation?.status ?? "Pendiente",
      };
    });

    return NextResponse.json(mentorships);
  } catch (error) {
    console.error("Error consultando mentorías:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar las mentorías.",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   POST
   El mentor confirma una mentoría puntual
   ========================================================= */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "No se encontró la sesión activa.",
        },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7).trim();
 
    const db = createAuthenticatedSupabase(token);

    /* =====================================================
       VALIDAR USUARIO
       ===================================================== */
    const {
      data: { user },
      error: userError,
    } = await db.auth.getUser(token);

    if (userError || !user) {
      console.error("Error validando usuario:", userError);

      return NextResponse.json(
        {
          error: "La sesión no es válida o ha expirado.",
          details: userError?.message,
        },
        { status: 401 },
      );
    }

    /* =====================================================
       BODY
       ===================================================== */
    const body = (await request.json()) as {
      microsoftBookingId?: string;
    };

    const microsoftBookingId = body.microsoftBookingId;

    
    /* =====================================================
       PERFIL
       ===================================================== */
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, rol, microsoft_staff_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      
      return NextResponse.json(
        {
          error: "No se pudo obtener el perfil del mentor.",
          details: profileError?.message,
        },
        { status: 404 },
      );
    }
 
     
    /* =====================================================
       GUARDAR CONFIRMACIÓN
       ===================================================== */
    const confirmedAt = new Date().toISOString();

    const { data: confirmation, error: confirmationError } = await db
      .from("appointment_confirmations")
      .upsert(
        {
          microsoft_booking_id: microsoftBookingId,

          confirmed: true,

          confirmed_by: user.id,

          confirmed_at: confirmedAt,
          status: "confirmada"
        },
        {
          onConflict: "microsoft_booking_id",
        },
      )
      .select()
      .single();

    if (confirmationError) {
      console.error("Error guardando confirmación:", confirmationError);

      return NextResponse.json(
        {
          error: confirmationError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(confirmation);
  } catch (error) {
    console.error("Error confirmando mentoría:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo confirmar la mentoría.",
      },
      { status: 500 },
    );
  }
}

 