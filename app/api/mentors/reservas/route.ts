
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

import { notificarMentoria } from "@/lib/mentoria-mail";
import { fechaHoraMentoria } from "@/lib/mentoria-fecha";

/* =========================================================
   TIPOS
========================================================= */

type Profile = {
  id: string;
  nombres?: string | null;
  apellidos?: string | null;
  email?: string | null;
  rol: string;
  microsoft_staff_id: string | null;
  microsoft_email?: string | null;
};

type GraphDateTime = {
  dateTime: string;
  timeZone?: string;
};

type Appointment = {
  id: string;
  serviceName?: string;
  staffMemberIds?: string[];
  startDateTime?: GraphDateTime;
  endDateTime?: GraphDateTime;
  onlineMeetingUrl?: string;
  customers?: Array<{
    name?: string;
    emailAddress?: string;
  }>;
};

type Confirmation = {
  microsoft_booking_id: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  status: string | null;
  realizacion_estado: string | null;
  realizacion_fecha: string | null;
  realizacion_por: string | null;
  realizacion_motivo: string | null;
};

type AuthenticatedContext = {
  db: ReturnType<
    typeof createAuthenticatedSupabase
  >;
  profile: Profile;
  userId: string;
};

type AuthenticationResult =
  | {
      success: true;
      context: AuthenticatedContext;
    }
  | {
      success: false;
      error: string;
      status: number;
    };

/* =========================================================
   CLIENTE SUPABASE AUTENTICADO
========================================================= */

function createAuthenticatedSupabase(
  token: string,
) {
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

function createAdminSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.",
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: message },
    { status },
  );
}

function parseAppointmentTime(
  dateValue?: GraphDateTime,
): number | null {
  if (!dateValue?.dateTime) {
    return null;
  }

  const raw = dateValue.dateTime.trim();

  const hasOffset =
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);

  if (!hasOffset) {
    if (
      dateValue.timeZone?.toUpperCase() ===
      "UTC"
    ) {
      const parsed = Date.parse(`${raw}Z`);

      return Number.isFinite(parsed)
        ? parsed
        : null;
    }

    return null;
  }

  const parsed = Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function hasAppointmentEnded(
  appointment: Appointment,
) {
  const endTime = parseAppointmentTime(
    appointment.endDateTime,
  );

  return (
    endTime !== null &&
    endTime <= Date.now()
  );
}

function isAssignedMentor(
  appointment: Appointment,
  profile: Profile,
) {
  return (
    profile.rol === "mentor" &&
    Boolean(profile.microsoft_staff_id) &&
    (appointment.staffMemberIds ?? []).includes(
      profile.microsoft_staff_id!,
    )
  );
}

/* =========================================================
   VALIDAR SESIÓN Y PERFIL
========================================================= */

async function getAuthenticatedProfile(
  request: Request,
): Promise<AuthenticationResult> {
  const authHeader =
    request.headers.get("authorization");

  if (
    !authHeader?.startsWith("Bearer ")
  ) {
    return {
      success: false,
      error:
        "No se encontró la sesión activa.",
      status: 401,
    };
  }

  const token = authHeader
    .slice(7)
    .trim();

  if (!token) {
    return {
      success: false,
      error:
        "No se encontró la sesión activa.",
      status: 401,
    };
  }

  const db =
    createAuthenticatedSupabase(token);

  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser(token);

  if (userError || !user) {
    return {
      success: false,
      error:
        "La sesión no es válida o ha expirado.",
      status: 401,
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await db
    .from("profiles")
    .select(
      "id, nombres, apellidos, email, rol, microsoft_staff_id, microsoft_email",
    )
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      success: false,
      error:
        "No se pudo obtener el perfil del mentor.",
      status: 404,
    };
  }

  return {
    success: true,
    context: {
      db,
      profile: profile as Profile,
      userId: user.id,
    },
  };
}

/* =========================================================
   CONSULTAR CITAS MICROSOFT BOOKINGS
========================================================= */

async function getAppointments():
  Promise<Appointment[]> {
  const businessId =
    getBookingBusinessId();

  const allAppointments:
    Appointment[] = [];

  let endpoint: string | null =
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId,
    )}/appointments`;

  const visited =
    new Set<string>();

  type GraphAppointmentsResponse = {
    value?: Appointment[];
    "@odata.nextLink"?: string;
  };

  while (endpoint !== null) {
    const currentEndpoint:
      string = endpoint;

    if (
      visited.has(currentEndpoint)
    ) {
      throw new Error(
        "Microsoft Bookings devolvió una paginación repetida.",
      );
    }

    visited.add(currentEndpoint);

    const data =
      await graphRequest<GraphAppointmentsResponse>(
        currentEndpoint,
      );

    allAppointments.push(
      ...(data.value ?? []),
    );

    const nextLink =
      data["@odata.nextLink"];

    if (!nextLink) {
      endpoint = null;
      continue;
    }

    const graphUrl = new URL(
      nextLink,
      "https://graph.microsoft.com",
    );

    if (
      graphUrl.origin !==
        "https://graph.microsoft.com" ||
      !graphUrl.pathname.startsWith(
        "/v1.0/",
      )
    ) {
      throw new Error(
        "Microsoft Bookings devolvió una ruta de paginación no válida.",
      );
    }

    endpoint =
      graphUrl.pathname.replace(
        /^\/v1\.0/,
        "",
      ) + graphUrl.search;
  }

  return allAppointments;
}

/* =========================================================
   GET - CONSULTAR MENTORÍAS
========================================================= */

export async function GET(
  request: Request,
) {
  try {
    const authentication =
      await getAuthenticatedProfile(
        request,
      );

    if (!authentication.success) {
      return errorResponse(
        authentication.error,
        authentication.status,
      );
    }

    const { db, profile } =
      authentication.context;

    if (
      profile.rol !== "mentor" &&
      profile.rol !== "coordinador"
    ) {
      return errorResponse(
        "No tienes permisos para consultar mentorías.",
        403,
      );
    }

    if (
      profile.rol === "mentor" &&
      !profile.microsoft_staff_id
    ) {
      return errorResponse(
        "Tu cuenta no está vinculada a Microsoft Bookings.",
        400,
      );
    }

    const allAppointments =
      await getAppointments();

    const mentorMentorships =
      profile.rol === "coordinador"
        ? allAppointments
        : allAppointments.filter(
            (appointment) =>
              isAssignedMentor(
                appointment,
                profile,
              ),
          );

    if (
      mentorMentorships.length === 0
    ) {
      return NextResponse.json([]);
    }

    const bookingIds =
      mentorMentorships.map(
        (appointment) =>
          appointment.id,
      );

    /*
       CONSULTAR CONFIRMACIONES
    */

    const confirmationMap =
      new Map<string, Confirmation>();

    const BOOKING_BATCH_SIZE = 100;

    for (
      let index = 0;
      index < bookingIds.length;
      index += BOOKING_BATCH_SIZE
    ) {
      const batch =
        bookingIds.slice(
          index,
          index + BOOKING_BATCH_SIZE,
        );

      const {
        data: confirmations,
        error: confirmationsError,
      } = await db
        .from(
          "appointment_confirmations",
        )
        .select(
          "microsoft_booking_id, confirmed_at, confirmed_by, status, realizacion_estado, realizacion_fecha, realizacion_por, realizacion_motivo",
        )
        .in(
          "microsoft_booking_id",
          batch,
        );

      if (confirmationsError) {
        console.error(
          "Error consultando confirmaciones:",
          confirmationsError,
        );

        return errorResponse(
          "No se pudieron consultar las confirmaciones.",
          500,
        );
      }

      for (
        const confirmation of
        confirmations ?? []
      ) {
        confirmationMap.set(
          confirmation.microsoft_booking_id,
          confirmation,
        );
      }
    }

    /*
       CONTAR ACUERDOS POR MENTORÍA
    */

    const agreementCountMap:
      Record<string, number> = {};

    for (
      const bookingId of bookingIds
    ) {
      agreementCountMap[bookingId] = 0;
    }

    const AGREEMENT_PAGE_SIZE =
      1000;

    for (
      let batchStart = 0;
      batchStart < bookingIds.length;
      batchStart += BOOKING_BATCH_SIZE
    ) {
      const bookingBatch =
        bookingIds.slice(
          batchStart,
          batchStart + BOOKING_BATCH_SIZE,
        );

      let from = 0;

      while (true) {
        const {
          data: agreements,
          error: agreementsError,
        } = await db
          .from("acuerdos")
          .select(
            "microsoft_booking_id",
          )
          .in(
            "microsoft_booking_id",
            bookingBatch,
          )
          .order(
            "microsoft_booking_id",
          )
          .range(
            from,
            from +
              AGREEMENT_PAGE_SIZE -
              1,
          );

        if (agreementsError) {
          console.error(
            "Error consultando acuerdos por reunión:",
            agreementsError,
          );

          return errorResponse(
            "No se pudieron consultar los acuerdos de las mentorías.",
            500,
          );
        }

        const rows =
          agreements ?? [];

        for (
          const agreement of rows
        ) {
          const bookingId =
            agreement.microsoft_booking_id;

          if (bookingId) {
            agreementCountMap[
              bookingId
            ] =
              (
                agreementCountMap[
                  bookingId
                ] ?? 0
              ) + 1;
          }
        }

        if (
          rows.length <
          AGREEMENT_PAGE_SIZE
        ) {
          break;
        }

        from +=
          AGREEMENT_PAGE_SIZE;
      }
    }

    /*
       CONSTRUIR RESPUESTA
    */

    const mentorships =
      mentorMentorships.map(
        (appointment) => {
          const confirmation =
            confirmationMap.get(
              appointment.id,
            );

          const customer =
            appointment.customers?.[0];

          return {
            id:
              appointment.id,

            serviceName:
              appointment.serviceName ??
              "Sesión de mentoría",

            menteeName:
              customer?.name ??
              "Mentee PROUNI",

            menteeEmail:
              customer?.emailAddress ??
              null,

            startDateTime:
              appointment.startDateTime,

            endDateTime:
              appointment.endDateTime,

            onlineMeetingUrl:
              appointment.onlineMeetingUrl ??
              null,

            confirmedAt:
              confirmation?.confirmed_at ??
              null,

            status:
              confirmation?.status ??
              "pendiente",

            agreementCount:
              agreementCountMap[
                appointment.id
              ] ?? 0,

            realizacionEstado:
              confirmation?.realizacion_estado ??
              "pendiente",

            realizacionFecha:
              confirmation?.realizacion_fecha ??
              null,

            realizacionMotivo:
              confirmation?.realizacion_motivo ??
              null,
          };
        },
      );

    return NextResponse.json(
      mentorships,
    );
  } catch (error) {
    console.error(
      "Error consultando mentorías:",
      error,
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : "No se pudieron consultar las mentorías.",
      500,
    );
  }
}

/* =========================================================
   POST - CONFIRMAR MENTORÍA
========================================================= */

export async function POST(
  request: Request,
) {
  try {
    const authentication =
      await getAuthenticatedProfile(
        request,
      );

    if (!authentication.success) {
      return errorResponse(
        authentication.error,
        authentication.status,
      );
    }

    const {
      db,
      profile,
      userId,
    } = authentication.context;

    if (
      profile.rol !== "mentor"
    ) {
      return errorResponse(
        "Solo un mentor puede confirmar su reserva.",
        403,
      );
    }

    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      !(
        "microsoftBookingId" in body
      ) ||
      typeof body.microsoftBookingId !==
        "string" ||
      !body.microsoftBookingId.trim()
    ) {
      return errorResponse(
        "Debes indicar la mentoría que deseas confirmar.",
        400,
      );
    }

    const microsoftBookingId =
      body.microsoftBookingId.trim();

    /*
       VALIDAR QUE LA MENTORÍA EXISTA
       Y CORRESPONDA AL MENTOR
    */

    const appointments =
      await getAppointments();

    const appointment =
      appointments.find(
        (item) =>
          item.id ===
          microsoftBookingId,
      );

    if (!appointment) {
      return errorResponse(
        "No se encontró la mentoría.",
        404,
      );
    }

    if (
      !isAssignedMentor(
        appointment,
        profile,
      )
    ) {
      return errorResponse(
        "No tienes permisos para confirmar esta mentoría.",
        403,
      );
    }

    /*
       EVITAR CONFIRMACIONES DUPLICADAS
    */

    const {
      data: existing,
      error: existingError,
    } = await db
      .from(
        "appointment_confirmations",
      )
      .select(
        "microsoft_booking_id, status, confirmed_at",
      )
      .eq(
        "microsoft_booking_id",
        microsoftBookingId,
      )
      .maybeSingle();

    if (existingError) {
      return errorResponse(
        "No se pudo verificar la confirmación existente.",
        500,
      );
    }

    if (
      existing?.status ===
      "confirmada"
    ) {
      return NextResponse.json({
        ...existing,
        status: "confirmada",
      });
    }

    /*
       GUARDAR CONFIRMACIÓN
    */

    const confirmedAt =
      new Date().toISOString();

    const {
      data: confirmation,
      error: confirmationError,
    } = await db
      .from(
        "appointment_confirmations",
      )
      .upsert(
        {
          microsoft_booking_id:
            microsoftBookingId,

          confirmed_by:
            userId,

          confirmed_at:
            confirmedAt,

          status:
            "confirmada",
        },
        {
          onConflict:
            "microsoft_booking_id",
        },
      )
      .select()
      .single();

    if (confirmationError) {
      console.error(
        "Error confirmando mentoría:",
        confirmationError,
      );

      return errorResponse(
        confirmationError.message,
        500,
      );
    }

    /*
       NUEVO: CORREO DE CONFIRMACIÓN

       Solo después de confirmar
       correctamente en Supabase.
    */

    if (
      process.env.PRUNI_NOTIFICACIONES_ACTIVAS ===
      "true"
    ) {
      try {
        const mentee =
          appointment.customers?.find(
            (customer) =>
              customer.emailAddress,
          );

        const horario =
          fechaHoraMentoria(
            appointment.startDateTime,
          );

        if (
          mentee?.emailAddress &&
          horario
        ) {
          const nombreMentor = [
            profile.nombres,
            profile.apellidos,
          ]
            .filter(Boolean)
            .join(" ")
            .trim() ||
            "Mentor ProUni";

          await notificarMentoria({
            bookingId:
              microsoftBookingId,

            event:
              "confirmacion-mentee",

            recipient:
              mentee.emailAddress,

            data: {
              mentorNombre:
                nombreMentor,

              menteeNombre:
                mentee.name ||
                "Mentee ProUni",

              menteeEmail:
                mentee.emailAddress,

              fecha:
                horario.fecha,

              hora:
                horario.hora,
            },
          });
        } else {
          console.error(
            "[mentor-confirm] Falta destinatario o fecha válida:",
            microsoftBookingId,
          );
        }
      } catch (mailError) {
        console.error(
          "[mentor-confirm] Confirmación guardada; fallo de correo:",
          mailError,
        );
      }
    }

    return NextResponse.json(
      confirmation,
    );
  } catch (error) {
    console.error(
      "Error confirmando mentoría:",
      error,
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : "No se pudo confirmar la mentoría.",
      500,
    );
  }
}

/* =========================================================
   PATCH - REGISTRAR REALIZACIÓN
========================================================= */

export async function PATCH(
  request: Request,
) {
  try {
    const authentication =
      await getAuthenticatedProfile(
        request,
      );

    if (!authentication.success) {
      return errorResponse(
        authentication.error,
        authentication.status,
      );
    }

    const {
      profile,
      userId,
    } = authentication.context;

    if (
      profile.rol !== "mentor"
    ) {
      return errorResponse(
        "Solo el mentor puede registrar el resultado de la sesión.",
        403,
      );
    }

    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object"
    ) {
      return errorResponse(
        "Los datos enviados no son válidos.",
        400,
      );
    }

    const input =
      body as Record<
        string,
        unknown
      >;

    const microsoftBookingId =
      typeof input.microsoftBookingId ===
      "string"
        ? input.microsoftBookingId.trim()
        : "";

    const realizacionEstado =
      input.realizacionEstado;

    const realizacionMotivo =
      typeof input.realizacionMotivo ===
      "string"
        ? input.realizacionMotivo.trim()
        : "";

    if (!microsoftBookingId) {
      return errorResponse(
        "Debes seleccionar una mentoría.",
        400,
      );
    }

    if (
      realizacionEstado !==
        "realizada" &&
      realizacionEstado !==
        "no_realizada"
    ) {
      return errorResponse(
        "Selecciona si la mentoría se realizó o no.",
        400,
      );
    }

    if (
      realizacionMotivo.length >
      1000
    ) {
      return errorResponse(
        "El motivo no puede superar 1000 caracteres.",
        400,
      );
    }

    /*
       VALIDAR ASIGNACIÓN EN BOOKINGS
    */

    const appointments =
      await getAppointments();

    const appointment =
      appointments.find(
        (item) =>
          item.id ===
          microsoftBookingId,
      );

    if (!appointment) {
      return errorResponse(
        "No se encontró la mentoría en Microsoft Bookings.",
        404,
      );
    }

    if (
      !isAssignedMentor(
        appointment,
        profile,
      )
    ) {
      return errorResponse(
        "No tienes permisos para registrar esta mentoría.",
        403,
      );
    }

    if (
      !hasAppointmentEnded(
        appointment,
      )
    ) {
      return errorResponse(
        "No se pudo verificar que la mentoría haya finalizado. Comprueba la fecha y zona horaria de Microsoft Bookings.",
        400,
      );
    }

    /*
       VALIDAR CONFIRMACIÓN EXISTENTE
    */

    const adminDb =
      createAdminSupabase();

    const {
      data: confirmation,
      error: confirmationError,
    } = await adminDb
      .from(
        "appointment_confirmations",
      )
      .select(
        "microsoft_booking_id, status, realizacion_estado",
      )
      .eq(
        "microsoft_booking_id",
        microsoftBookingId,
      )
      .maybeSingle();

    if (confirmationError) {
      console.error(
        "Error verificando confirmación:",
        confirmationError,
      );

      return errorResponse(
        "No se pudo verificar la confirmación de la mentoría.",
        500,
      );
    }

    if (
      !confirmation ||
      confirmation.status !==
        "confirmada"
    ) {
      return errorResponse(
        "La mentoría debe estar confirmada antes de registrar su realización.",
        400,
      );
    }

    if (
      confirmation.realizacion_estado !==
      "pendiente"
    ) {
      return errorResponse(
        "Esta mentoría ya tiene un resultado registrado.",
        409,
      );
    }

    /*
       GUARDAR RESULTADO DE MENTORÍA
    */

    const realizacionFecha =
      new Date().toISOString();

    const {
      data: updated,
      error: updateError,
    } = await adminDb
      .from(
        "appointment_confirmations",
      )
      .update({
        realizacion_estado:
          realizacionEstado,

        realizacion_fecha:
          realizacionFecha,

        realizacion_por:
          userId,

        realizacion_motivo:
          realizacionEstado ===
          "no_realizada"
            ? realizacionMotivo ||
              null
            : null,
      })
      .eq(
        "microsoft_booking_id",
        microsoftBookingId,
      )
      .eq(
        "realizacion_estado",
        "pendiente",
      )
      .eq(
        "status",
        "confirmada",
      )
      .select(
        "microsoft_booking_id, realizacion_estado, realizacion_fecha, realizacion_motivo",
      )
      .maybeSingle();

    if (updateError) {
      console.error(
        "Error registrando realización:",
        updateError,
      );

      return errorResponse(
        "No se pudo guardar el resultado de la mentoría.",
        500,
      );
    }

    if (!updated) {
      return errorResponse(
        "El resultado de esta mentoría ya fue registrado.",
        409,
      );
    }

    return NextResponse.json({
      message:
        "Guardado correctamente.",

      microsoftBookingId,

      realizacionEstado:
        updated.realizacion_estado,

      realizacionFecha:
        updated.realizacion_fecha,

      realizacionMotivo:
        updated.realizacion_motivo,
    });
  } catch (error) {
    console.error(
      "Error registrando realización:",
      error,
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : "No se pudo registrar la realización de la mentoría.",
      500,
    );
  }
}
