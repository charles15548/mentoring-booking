
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   DIAGNÓSTICO DE NOTIFICACIONES DEL MENTOR

   - Solo funciona en desarrollo.
   - Requiere una clave privada.
   - Solo consulta información.
   - No modifica Microsoft Bookings.
========================================================= */

type BookingStaff = {
  id: string;
  displayName?: string;
  emailAddress?: string;
  role?: string;
  isEmailNotificationEnabled?: boolean;
  availabilityIsAffectedByPersonalCalendar?: boolean;
};

type StaffResponse = {
  value?: BookingStaff[];
};

function authorized(request: NextRequest): boolean {
  const expected =
    process.env.BOOKINGS_DIAGNOSTIC_KEY;

  const provided =
    request.headers.get("x-diagnostic-key");

  if (!expected || !provided) {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(provided);

  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

/* =========================================================
   POST: VERIFICAR CONFIGURACIÓN DEL MENTOR
========================================================= */

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Ruta no disponible." },
      { status: 404 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Acceso no autorizado." },
      { status: 401 },
    );
  }

  try {
    const businessId =
      getBookingBusinessId();

    /*
       1. CONSULTAR PERSONAL DEL CALENDARIO
    */

    const staffResponse =
      await graphRequest<StaffResponse>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/staffMembers`,
      );

    /*
       2. IDENTIFICAR A CÉSAR PONGO

       Usamos el correo registrado en Bookings
       para evitar consultar a otro mentor.
    */

    const mentorEmail =
      "formacion.virtual.peru@gmail.com";

    const mentor = (
      staffResponse.value ?? []
    ).find(
      (staff) =>
        staff.emailAddress
          ?.trim()
          .toLowerCase() === mentorEmail,
    );

    if (!mentor) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se encontró a César Pongo entre los miembros del personal de Bookings.",
        },
        { status: 404 },
      );
    }

    /*
       3. OBTENER CONFIGURACIÓN DETALLADA
    */

    const staff =
      await graphRequest<BookingStaff>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/staffMembers/${encodeURIComponent(
          mentor.id,
        )}`,
      );

    /*
       4. INTERPRETAR LA PROPIEDAD
    */

    const value =
      staff.isEmailNotificationEnabled;

    let diagnostico: string;

    if (value === false) {
      diagnostico =
        "Las notificaciones de personal están desactivadas en Microsoft Graph. Los mensajes recibidos podrían corresponder a invitaciones de calendario u otro mecanismo de Bookings.";
    } else if (value === true) {
      diagnostico =
        "Las notificaciones del mentor están activadas en Microsoft Graph. Se puede evaluar desactivarlas mediante PATCH.";
    } else {
      diagnostico =
        "Microsoft Graph no devolvió la propiedad isEmailNotificationEnabled. No podemos determinar su estado.";
    }

    console.log(
      "[diagnostico-bookings] Resultado:",
      {
        staffId: staff.id,
        isEmailNotificationEnabled: value,
        role: staff.role,
      },
    );

    return NextResponse.json({
      success: true,

      mentor: {
        id: staff.id,
        nombre: staff.displayName,
        rol: staff.role,
        notificacionesCorreo:
          value ?? null,
        calendarioPersonalAfectaDisponibilidad:
          staff.availabilityIsAffectedByPersonalCalendar ??
          null,
      },

      diagnostico,

      cambiosRealizados: false,
    });
  } catch (error) {
    console.error(
      "[diagnostico-bookings] Error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo consultar la configuración de Microsoft Bookings. Revisa los registros del servidor.",
      },
      { status: 500 },
    );
  }
}
