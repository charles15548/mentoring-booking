// // app/api/bookings/confirm/route.ts
// import { NextResponse } from "next/server";
// import {
//   supabase,
// } from "@/lib/supabase";
// import {
//   getBookingBusinessId,
//   graphRequest,
// } from "@/lib/microsoft-graph";

// /* =========================================================
//    GET
//    El mentor consulta SUS mentorías (citas donde es staff)
//    ========================================================= */
// export async function GET(request: Request) {
// const authHeader = request.headers.get("authorization");

// const token = authHeader?.replace("Bearer ", "");

// if (!token) {
//   return NextResponse.json(
//     { error: "No se encontró la sesión activa." },
//     { status: 401 },
//   );
// }

// const {
//   data: { user },
//   error: userError,
// } = await supabase.auth.getUser(token);

// if (userError || !user) {
//   return NextResponse.json(
//     { error: "La sesión no es válida o ha expirado." },
//     { status: 401 },
//   );
// }

//     // traemos el perfil
// //   const { data: profile, error: profileError } = await supabase
// //     .from("profiles")
// //     .select("microsoft_staff_id, microsoft_email, rol")
// //     .eq("id", user.id)
// //     .single();

// const { data: profile, error: profileError } = await supabase
//   .from("profiles")
//   .select("id, nombres, email, rol, microsoft_staff_id, microsoft_email")
//   .eq("id", user.id)
//   .maybeSingle();

// console.log("AUTH USER:", {
//   id: user.id,
//   email: user.email,
// });

// console.log("PROFILE:", profile);
// console.log("PROFILE ERROR:", profileError);

//     if(profileError || !profile){
//         return NextResponse.json(
//                 { error: "No se pudo obtener el perfil del mentor." },
//       { status: 404 },
//         );
//     }

//    try{
//     const businessId = getBookingBusinessId();

//     const appointmentsData = await graphRequest<{
//         value?: Array<{
//                     id: string;
//         serviceName?: string;
//         staffMemberIds?: string[];
//         startDateTime?: { dateTime: string };
//         endDateTime?: { dateTime: string };
//         onlineMeetingUrl?: string;
//         customers?: Array<{
//             name?: string;
//             emailAddress?: string;
//         }>;
//         }>;
//     }>(
//         `/solutions/bookingBusinesses/${encodeURIComponent(
//             businessId,
//         )}/appointments`,
//     );

//     // filtro para citas donde el mentor este asignado
//     const mentorMentorship = (appointmentsData.value || []).filter(
//         (appointment) =>
//             appointment.staffMemberIds?.includes(
//                 profile.microsoft_staff_id || "",
//             ),
//     );
//     if(mentorMentorship.length ===0){return NextResponse.json([])}

//     // Traemos las confirmaciones ya guardadas para estas citas

//     const bookingIds = mentorMentorship.map((a) => a.id);

//     const { data: confirmations } = await supabase
//       .from("appointment_confirmations")
//       .select("microsoft_booking_id, confirmed, confirmed_at")
//       .in("microsoft_booking_id", bookingIds);

//     const confirmationMap: Record<string,{confirmed: boolean; confirmed_at: string | null}>={};

//     for (const c of confirmations || []){
//         confirmationMap[c.microsoft_booking_id] = c;
//     }

//     const mentorships = mentorMentorship.map((appointment) =>{
//         const confirmation = confirmationMap[appointment.id];
//         const customer = appointment.customers?.[0];

//         return {
//             id: appointment.id,
//             serviceName: appointment.serviceName || "Sesión de mentoría",
//             menteeName: customer?.name,
//         menteeEmail: customer?.emailAddress,
//         startDateTime: appointment.startDateTime,
//         endDateTime: appointment.endDateTime,
//         onlineMeetingUrl: appointment.onlineMeetingUrl,
//         confirmed: confirmation?.confirmed ?? false,
//         confirmedAt: confirmation?.confirmed_at ?? null,
//         status: confirmation?.confirmed ? "Confirmada" : "Pendiente",

//         };
//     });
//     return NextResponse.json(mentorships);

//    } catch(error){
//     console.error("Error consutando mentorías", error);
//    return NextResponse.json(
//       {
//         error:
//           error instanceof Error
//             ? error.message
//             : "No se pudieron consultar las mentorías",
//       },
//       { status: 500 },
//     );
//    }
// }

// /* =========================================================
//    POST
//    El mentor confirma una mentoría puntual
//    ========================================================= */
// export async function POST(request: Request) {
//   const { microsoftBookingId } = (await request.json()) as{
//     microsoftBookingId: string;
//   };

// const authHeader = request.headers.get("authorization");

// const token = authHeader?.replace("Bearer ", "");

// if (!token) {
//   return NextResponse.json(
//     { error: "No se encontró la sesión activa." },
//     { status: 401 },
//   );
// }

// const {
//   data: { user },
//   error: userError,
// } = await supabase.auth.getUser(token);

// if (userError || !user) {
//   return NextResponse.json(
//     { error: "La sesión no es válida o ha expirado." },
//     { status: 401 },
//   );
// }

//   const {data:profile} = await supabase
//   .from("profiles")
//   .select("microsoft_staff_id, rol")
//   .eq("id", user.id)
//   .single();

//   if (!profile?.microsoft_staff_id) {
//     return NextResponse.json(
//       { error: "Tu usuario no tiene un mentor vinculado en Microsoft Bookings." },
//       { status: 403 },
//     );
//   }

//   try{
//     const businessId = getBookingBusinessId();
//     const appointment  = await graphRequest<{
//         id: string;
//         staffMemberIds?: string[];
//     }>(
//         `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}/appointments/${encodeURIComponent(microsoftBookingId)}`,
//     );

//         const isOwner = appointment.staffMemberIds?.includes(
//       profile.microsoft_staff_id,
//     );

//     if (!isOwner && profile.rol !== "coordinador") {
//       return NextResponse.json(
//         { error: "No puedes confirmar una mentoría que no es tuya." },
//         { status: 403 },
//       );
//     }
//     const {data, error} = await supabase
//     .from("appointment_confirmations")
//     .upsert({
//         microsoft_booking_id: microsoftBookingId,
//         confirmed: true,
//         confirmed_by: user.id,
//         confirmed_at: new Date().toISOString(),
//     })
//     .select()
//     .single();

//     if(error){
//         return NextResponse.json({error: error.message},{status: 500});
//     }
//     return NextResponse.json(data);

//   }catch (error) {
//     console.error("Error confirmando mentoría:", error);

//     return NextResponse.json(
//       {
//         error:
//           error instanceof Error
//             ? error.message
//             : "No se pudo confirmar la mentoría",
//       },
//       { status: 500 },
//     );

//     }
// }

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
      .select("microsoft_booking_id, confirmed, confirmed_at, confirmed_by")
      .in("microsoft_booking_id", bookingIds);

    const confirmationMap: Record<
      string,
      {
        confirmed: boolean;
        confirmed_at: string | null;
        confirmed_by: string | null;
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
        status: confirmation?.confirmed ? "Confirmada" : "Pendiente",
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

    if (!token) {
      return NextResponse.json(
        {
          error: "No se encontró la sesión activa.",
        },
        { status: 401 },
      );
    }

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

    if (!microsoftBookingId) {
      return NextResponse.json(
        {
          error: "Falta microsoftBookingId.",
        },
        { status: 400 },
      );
    }

    /* =====================================================
       PERFIL
       ===================================================== */
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, rol, microsoft_staff_id")
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

    if (profile.rol !== "mentor" && profile.rol !== "coordinador") {
      return NextResponse.json(
        {
          error: "Tu usuario no tiene permisos para confirmar mentorías.",
        },
        { status: 403 },
      );
    }

    if (profile.rol === "mentor" && !profile.microsoft_staff_id) {
      return NextResponse.json(
        {
          error: "Tu perfil no está vinculado con Microsoft Bookings.",
        },
        { status: 403 },
      );
    }

    /* =====================================================
       OBTENER CITA DESDE MICROSOFT
       ===================================================== */
    const businessId = getBookingBusinessId();

    const appointment = await graphRequest<{
      id: string;
      staffMemberIds?: string[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/appointments/${encodeURIComponent(microsoftBookingId)}`,
    );

    /* =====================================================
       VALIDAR PROPIEDAD
       ===================================================== */
    const isOwner =
      profile.rol === "coordinador"
        ? true
        : (appointment.staffMemberIds?.includes(profile.microsoft_staff_id!) ??
          false);

    if (!isOwner) {
      return NextResponse.json(
        {
          error: "No puedes confirmar una mentoría que no es tuya.",
        },
        { status: 403 },
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





