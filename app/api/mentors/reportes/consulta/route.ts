import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";

export const dynamic = "force-dynamic";

const TIME_ZONE = "America/Lima";
const BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

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
  customers?: Array<{
    name?: string;
    emailAddress?: string;
  }>;
};

type AgreementStatus = "pendiente" | "en_progreso" | "cumplido" | "cancelado";

type Agreement = {
  id: string;
  microsoft_booking_id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado: AgreementStatus;
  fecha_limite: string | null;
};

type Totals = {
  totalMentorias: number;
  totalAcuerdos: number;
  cumplidos: number;
  pendientes: number;
  enProgreso: number;
  cancelados: number;
};

function getDb() {
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

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Falta configurar el acceso de servidor a Supabase.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/* =========================================================
   FECHAS
========================================================= */

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T12:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function getLimaDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseGraphDate(value?: GraphDateTime): number | null {
  if (!value?.dateTime) return null;

  const raw = value.dateTime.trim();

  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    const time = Date.parse(raw);
    return Number.isFinite(time) ? time : null;
  }

  const zone = value.timeZone?.trim().toLowerCase();

  if (
    zone === "utc" ||
    zone === "etc/utc" ||
    zone === "coordinated universal time"
  ) {
    const time = Date.parse(`${raw}Z`);
    return Number.isFinite(time) ? time : null;
  }

  // Lima/Perú usa UTC-05:00 durante todo el año.
  if (zone === "america/lima" || zone === "sa pacific standard time") {
    const time = Date.parse(`${raw}-05:00`);
    return Number.isFinite(time) ? time : null;
  }

  // No asumir la zona horaria cuando Graph
  // entrega una fecha local sin referencia.
  return null;
}

/* =========================================================
   MICROSOFT BOOKINGS
========================================================= */

async function getAppointments(): Promise<Appointment[]> {
  const businessId = getBookingBusinessId();

  const appointments: Appointment[] = [];
  const visited = new Set<string>();

  type GraphResponse = {
    value?: Appointment[];
    "@odata.nextLink"?: string;
  };

  let endpoint: string | null =
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId,
    )}/appointments`;

  while (endpoint !== null) {
    const currentEndpoint: string = endpoint;

    if (visited.has(currentEndpoint)) {
      throw new Error("Microsoft Bookings devolvió una paginación repetida.");
    }

    visited.add(currentEndpoint);

    const data: GraphResponse =
      await graphRequest<GraphResponse>(currentEndpoint);

    appointments.push(...(data.value ?? []));

    const nextLink: string | undefined = data["@odata.nextLink"];

    if (!nextLink) {
      endpoint = null;
      continue;
    }

    const graphUrl: URL = new URL(nextLink, "https://graph.microsoft.com");

    if (
      graphUrl.origin !== "https://graph.microsoft.com" ||
      !graphUrl.pathname.startsWith("/v1.0/")
    ) {
      throw new Error("Microsoft Bookings devolvió una paginación inválida.");
    }

    endpoint = graphUrl.pathname.replace(/^\/v1\.0/, "") + graphUrl.search;
  }

  return appointments;
}

/* =========================================================
   CONTADORES
========================================================= */

function emptyTotals(): Totals {
  return {
    totalMentorias: 0,
    totalAcuerdos: 0,
    cumplidos: 0,
    pendientes: 0,
    enProgreso: 0,
    cancelados: 0,
  };
}

/* =========================================================
   GET /api/mentors/reportes/consulta
========================================================= */

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return fail("No se encontró la sesión activa.", 401);
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return fail("No se encontró la sesión activa.", 401);
    }

    const url = new URL(request.url);

    const desde = url.searchParams.get("desde") ?? "";
    const hasta = url.searchParams.get("hasta") ?? "";

    if (!validDate(desde) || !validDate(hasta)) {
      return fail("Selecciona fechas válidas para el reporte.", 400);
    }

    if (desde > hasta) {
      return fail("La fecha inicial no puede ser posterior a la final.", 400);
    }

    const start = new Date(`${desde}T12:00:00Z`);
    const end = new Date(`${hasta}T12:00:00Z`);

    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);

    if (days > 366) {
      return fail("El rango máximo de consulta es de 367 días.", 400);
    }

    /* =========================================
       AUTENTICACIÓN Y PERFIL
    ========================================= */

    const db = getDb();

    const {
      data: { user },
      error: userError,
    } = await db.auth.getUser(token);

    if (userError || !user) {
      return fail("La sesión no es válida o ha expirado.", 401);
    }

    const adminDb = getAdminDb();

    const { data: profile, error: profileError } = await adminDb
      .from("profiles")
      .select("id, nombres, apellidos, rol, activo, microsoft_staff_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return fail("No se encontró el perfil del mentor.", 404);
    }

    if (profile.rol !== "mentor" || profile.activo === false) {
      return fail("No tienes permisos para consultar este reporte.", 403);
    }

    if (!profile.microsoft_staff_id) {
      return fail("El mentor no está vinculado a Microsoft Bookings.", 400);
    }

    const mentorName =
      [profile.nombres, profile.apellidos].filter(Boolean).join(" ").trim() ||
      "Mentor PROUNI";

    /* =========================================
        RESERVAS ASIGNADAS AL MENTOR
       ========================================= */

    console.time("REPORTES_GRAPH");

    const appointments = await getAppointments();

    console.timeEnd("REPORTES_GRAPH");

    const mentorAppointments = appointments.filter((appointment) =>
      appointment.staffMemberIds?.includes(profile.microsoft_staff_id),
    );

    // Consultamos todos los identificadores
    // para recuperar sus resultados registrados.
    const bookingIds = mentorAppointments.map((appointment) => appointment.id);

    const realizaciones = new Set<string>();

    for (let index = 0; index < bookingIds.length; index += BATCH_SIZE) {
      const batch = bookingIds.slice(index, index + BATCH_SIZE);

      const { data: confirmations, error } = await adminDb
        .from("appointment_confirmations")
        .select("microsoft_booking_id, status, realizacion_estado")
        .in("microsoft_booking_id", batch)
        .eq("status", "confirmada")
        .eq("realizacion_estado", "realizada");

      if (error) {
        console.error(error);
        return fail(
          "No se pudo consultar la realización de las mentorías.",
          500,
        );
      }

      for (const row of confirmations ?? []) {
        realizaciones.add(row.microsoft_booking_id);
      }
    }

    /* =========================================
       FILTRAR POR REALIZACIÓN Y PERÍODO
    ========================================= */

    const realizadas = mentorAppointments
      .filter((appointment) => realizaciones.has(appointment.id))
      .map((appointment) => ({
        appointment,
        timestamp: parseGraphDate(appointment.startDateTime),
      }));

    if (realizadas.some((item) => item.timestamp === null)) {
      return fail(
        "No se pudo interpretar la zona horaria de una mentoría realizada. Revisa la configuración de Microsoft Bookings.",
        422,
      );
    }

    const periodoAppointments = realizadas
      .filter(
        (item) =>
          item.timestamp !== null &&
          getLimaDate(item.timestamp) >= desde &&
          getLimaDate(item.timestamp) <= hasta,
      )
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    const selectedIds = periodoAppointments.map((item) => item.appointment.id);

    /* =========================================
       ACUERDOS POR MENTORÍA
    ========================================= */

    const agreementMap = new Map<string, Agreement[]>();

    for (const id of selectedIds) {
      agreementMap.set(id, []);
    }

    for (let index = 0; index < selectedIds.length; index += BATCH_SIZE) {
      const batch = selectedIds.slice(index, index + BATCH_SIZE);

      let from = 0;

      while (true) {
        const { data, error } = await adminDb
          .from("acuerdos")
          .select(
            "id, microsoft_booking_id, titulo, descripcion, observacion, estado, fecha_limite",
          )
          .in("microsoft_booking_id", batch)
          .order("microsoft_booking_id")
          .order("id")
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error(error);
          return fail("No se pudieron consultar los acuerdos.", 500);
        }

        const rows = (data ?? []) as Agreement[];

        for (const agreement of rows) {
          const agreements = agreementMap.get(agreement.microsoft_booking_id);

          if (agreements) {
            agreements.push(agreement);
          }
        }

        if (rows.length < PAGE_SIZE) {
          break;
        }

        from += PAGE_SIZE;
      }
    }

    /* =========================================
       FOTOGRAFÍAS DE LOS MENTEES
    ========================================= */

    const uniqueEmails = [
      ...new Set(
        periodoAppointments
          .map(
            (item) =>
              item.appointment.customers?.[0]?.emailAddress
                ?.trim()
                .toLowerCase() ?? "",
          )
          .filter(Boolean),
      ),
    ];

    const photoMap = new Map<string, string | null>();

    /* =====================================================
   FOTOGRAFÍAS DE MENTEES EN PARALELO
===================================================== */

    const PHOTO_CONCURRENCY = 5;

    for (
      let index = 0;
      index < uniqueEmails.length;
      index += PHOTO_CONCURRENCY
    ) {
      const batch = uniqueEmails.slice(index, index + PHOTO_CONCURRENCY);

      await Promise.all(
        batch.map(async (email) => {
          try {
            const { data: mentee, error } = await adminDb
              .from("profiles")
              .select("foto_url")
              .eq("rol", "mentee")
              .ilike("email", email)
              .maybeSingle();

            if (error) {
              console.error("Error consultando foto del mentee:", error);
            }

            const photo = mentee?.foto_url ?? null;

            photoMap.set(
              email,
              photo && /^https?:\/\//i.test(photo) ? photo : null,
            );
          } catch (error) {
            console.error("Error recuperando fotografía:", error);

            photoMap.set(email, null);
          }
        }),
      );
    }

    /* =========================================
       CONSTRUIR RESULTADO
    ========================================= */

    const totals = emptyTotals();

    const sesiones = periodoAppointments.map(({ appointment, timestamp }) => {
      const agreements = agreementMap.get(appointment.id) ?? [];

      const customer = appointment.customers?.[0];

      const email = customer?.emailAddress?.trim().toLowerCase() ?? "";

      const conteo = {
        totalAcuerdos: agreements.length,
        cumplidos: 0,
        pendientes: 0,
        enProgreso: 0,
        cancelados: 0,
      };

      for (const agreement of agreements) {
        switch (agreement.estado) {
          case "cumplido":
            conteo.cumplidos++;
            break;
          case "pendiente":
            conteo.pendientes++;
            break;
          case "en_progreso":
            conteo.enProgreso++;
            break;
          case "cancelado":
            conteo.cancelados++;
            break;
        }
      }

      totals.totalAcuerdos += conteo.totalAcuerdos;

      totals.cumplidos += conteo.cumplidos;
      totals.pendientes += conteo.pendientes;
      totals.enProgreso += conteo.enProgreso;
      totals.cancelados += conteo.cancelados;

      return {
        bookingId: appointment.id,
        fecha: timestamp !== null ? new Date(timestamp).toISOString() : null,
        servicio: appointment.serviceName ?? "Sesión de mentoría",
        mentee: {
          nombre: customer?.name ?? "Mentee PROUNI",
          email,
          fotoUrl: photoMap.get(email) ?? null,
        },
        conteo,
        acuerdos: agreements.map((agreement) => ({
          id: agreement.id,
          titulo: agreement.titulo,
          descripcion: agreement.descripcion,
          observacion: agreement.observacion,
          estado: agreement.estado,
          fechaLimite: agreement.fecha_limite,
        })),
      };
    });

    totals.totalMentorias = sesiones.length;

    return NextResponse.json({
      mentor: {
        id: profile.id,
        nombre: mentorName,
      },
      periodo: {
        desde,
        hasta,
      },
      totales: totals,
      sesiones,
    });
  } catch (error) {
    console.error("Error consultando reporte de mentorías:", error);

    return fail(
      error instanceof Error
        ? error.message
        : "No se pudo consultar el reporte.",
      500,
    );
  }
}
