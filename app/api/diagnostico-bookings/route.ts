import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   DIAGNÓSTICO DE MICROSOFT BOOKINGS

   GET:
   - Consulta personal y roles.
   - Consulta servicios y personal asignado.
   - Identifica la cuenta CEA Patronato.
   - No modifica información.

   POST:
   - Conserva el diagnóstico de notificaciones
     del mentor César Pongo.

   SEGURIDAD:
   - Solo disponible en desarrollo.
   - Requiere BOOKINGS_DIAGNOSTIC_KEY.
========================================================= */

type BookingStaff = {
  id: string;
  displayName?: string;
  emailAddress?: string;
  role?: string;
  isEmailNotificationEnabled?: boolean;
  availabilityIsAffectedByPersonalCalendar?: boolean;
};

type BookingService = {
  id: string;
  displayName?: string;
  staffMemberIds?: string[];
};

type StaffResponse = {
  value?: BookingStaff[];
  "@odata.nextLink"?: string;
};

type ServicesResponse = {
  value?: BookingService[];
  "@odata.nextLink"?: string;
};

/* =========================================================
   SEGURIDAD
========================================================= */

function authorized(request: NextRequest): boolean {
  const expected = process.env.BOOKINGS_DIAGNOSTIC_KEY;

  const provided = request.headers.get("x-diagnostic-key");

  if (!expected || !provided) {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(provided);

  return left.length === right.length && timingSafeEqual(left, right);
}

function validateRequest(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Ruta no disponible." }, { status: 404 });
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Acceso no autorizado." },
      { status: 401 },
    );
  }

  return null;
}

/* =========================================================
   GET: DIAGNÓSTICO GENERAL DE BOOKINGS
========================================================= */

export async function GET(request: NextRequest) {
  const validation = validateRequest(request);

  if (validation) {
    return validation;
  }

  try {
    const businessId = getBookingBusinessId();

    const [staffResponse, servicesResponse] = await Promise.all([
      graphRequest<StaffResponse>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/staffMembers`,
      ),

      graphRequest<ServicesResponse>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/services`,
      ),
    ]);

    const staff = staffResponse.value ?? [];
    const services = servicesResponse.value ?? [];

    const staffMap = new Map(staff.map((member) => [member.id, member]));

    const personal = staff.map((member) => ({
      id: member.id,
      nombre: member.displayName ?? "",
      correo: member.emailAddress ?? "",
      rol: member.role ?? "No informado",
    }));

    const servicios = services.map((service) => {
      const assignedIds = service.staffMemberIds ?? [];

      return {
        id: service.id,
        nombre: service.displayName ?? "",
        totalPersonalAsignado: assignedIds.length,

        personalAsignado: assignedIds.map((id) => ({
          id,
          nombre: staffMap.get(id)?.displayName ?? "Personal no encontrado",
          correo: staffMap.get(id)?.emailAddress ?? "",
        })),
      };
    });

    const administradores = personal.filter(
      (member) => member.rol.toLowerCase() === "administrator",
    );

    const cea = personal.filter((member) =>
      member.correo.toLowerCase().startsWith("intranet@"),
    );

    return NextResponse.json(
      {
        success: true,
        businessId,

        resumen: {
          totalPersonal: personal.length,
          totalServicios: servicios.length,
          totalAdministradores: administradores.length,
          personalCompleto: !staffResponse["@odata.nextLink"],
          serviciosCompletos: !servicesResponse["@odata.nextLink"],
        },

        ceaPatronato: cea,
        administradores,
        personal,
        servicios,

        cambiosRealizados: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[diagnostico-bookings][GET] Error:", error);

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

/* =========================================================
   POST: DIAGNÓSTICO DE NOTIFICACIONES DE CÉSAR PONGO
========================================================= */

export async function POST(request: NextRequest) {
  const validation = validateRequest(request);

  if (validation) {
    return validation;
  }

  try {
    const businessId = getBookingBusinessId();

    const staffResponse = await graphRequest<StaffResponse>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers`,
    );

    const mentorEmail = "formacion.virtual.peru@gmail.com";

    const mentor = (staffResponse.value ?? []).find(
      (staff) => staff.emailAddress?.trim().toLowerCase() === mentorEmail,
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

    const staff = await graphRequest<BookingStaff>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers/${encodeURIComponent(mentor.id)}`,
    );

    const value = staff.isEmailNotificationEnabled;

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

    console.log("[diagnostico-bookings][POST] Resultado:", {
      staffId: staff.id,
      isEmailNotificationEnabled: value,
      role: staff.role,
    });

    return NextResponse.json({
      success: true,

      mentor: {
        id: staff.id,
        nombre: staff.displayName,
        rol: staff.role,
        notificacionesCorreo: value ?? null,
        calendarioPersonalAfectaDisponibilidad:
          staff.availabilityIsAffectedByPersonalCalendar ?? null,
      },

      diagnostico,
      cambiosRealizados: false,
    });
  } catch (error) {
    console.error("[diagnostico-bookings][POST] Error:", error);

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
