import { NextRequest, NextResponse } from "next/server";
import {
  getBookingBusinessId,
  graphRequest,
  toGraphUtcDateTime,
} from "@/lib/microsoft-graph";

interface GraphService {
  id: string;
  displayName: string;
  defaultDuration?: string;
  staffMemberIds?: string[];
}

interface AvailabilityItem {
  status: string;

  startDateTime: {
    dateTime: string;
    timeZone?: string;
  };

  endDateTime: {
    dateTime: string;
    timeZone?: string;
  };

  serviceId?: string;
}

interface StaffAvailabilityItem {
  staffId: string;
  availabilityItems?: AvailabilityItem[];
}

interface AvailabilityResponse {
  value?: StaffAvailabilityItem[];
  staffAvailabilityItem?: StaffAvailabilityItem[];
}

/*
 * =========================================================
 * CITAS DE MICROSOFT BOOKINGS
 * =========================================================
 */

interface BookingAppointment {
  id: string;

  staffMemberIds?: string[];

  startDateTime?: {
    dateTime: string;
    timeZone?: string;
  };

  endDateTime?: {
    dateTime: string;
    timeZone?: string;
  };

  isCustomerCancellation?: boolean;
  isStaffCancellation?: boolean;
}

/*
 * =========================================================
 * GET
 * =========================================================
 */

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      staffId: string;
    }>;
  },
) {
  try {
    const { staffId } = await context.params;

    if (!staffId) {
      return NextResponse.json(
        {
          error: "Falta el ID del mentor.",
        },
        {
          status: 400,
        },
      );
    }

    const businessId = getBookingBusinessId();

    /*
     * =========================================================
     * 1. OBTENER SERVICIOS
     * =========================================================
     */

    const servicesResponse = await graphRequest<{
      value: GraphService[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/services`,
    );

    const services = servicesResponse.value.map((service) => ({
      id: service.id,
      name: service.displayName,
      duration: service.defaultDuration ?? "PT30M",
      staffMemberIds: service.staffMemberIds ?? [],
    }));

    /*
     * =========================================================
     * 2. RANGO DE LOS PRÓXIMOS 14 DÍAS
     * =========================================================
     */

    const now = new Date();

    const end = new Date(
      now.getTime() +
        14 * 24 * 60 * 60 * 1000,
    );

    /*
     * =========================================================
     * 3. OBTENER DISPONIBILIDAD DEL MENTOR
     * =========================================================
     */

    const availabilityResponse =
      await graphRequest<AvailabilityResponse>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/getStaffAvailability`,
        {
          method: "POST",

          body: JSON.stringify({
            staffIds: [staffId],

            startDateTime: {
              dateTime: toGraphUtcDateTime(
                now.toISOString(),
              ),
              timeZone: "UTC",
            },

            endDateTime: {
              dateTime: toGraphUtcDateTime(
                end.toISOString(),
              ),
              timeZone: "UTC",
            },
          }),
        },
      );

    const availability =
      availabilityResponse.value ??
      availabilityResponse.staffAvailabilityItem ??
      [];

    /*
     * =========================================================
     * 4. OBTENER TODAS LAS CITAS DEL NEGOCIO
     * =========================================================
     *
     * Microsoft Bookings no nos entrega las citas ocupadas
     * como "available". Por eso necesitamos consultar las
     * citas existentes y cruzarlas con el mentor.
     */

    const appointmentsResponse =
      await graphRequest<{
        value?: BookingAppointment[];
      }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/appointments`,
      );

    const allAppointments =
      appointmentsResponse.value ?? [];

    /*
     * =========================================================
     * 5. FILTRAR SOLO LAS CITAS DEL MENTOR
     * =========================================================
     *
     * También limitamos las citas al rango de los próximos
     * 14 días.
     */

    const bookedAppointments = allAppointments
      .filter((appointment) => {
        /*
         * La cita debe pertenecer al mentor.
         */
        if (
          !appointment.staffMemberIds?.includes(
            staffId,
          )
        ) {
          return false;
        }

        /*
         * Si fue cancelada por el cliente o por el mentor,
         * ya no debe bloquear el horario.
         */
        if (
          appointment.isCustomerCancellation ||
          appointment.isStaffCancellation
        ) {
          return false;
        }

        /*
         * Debe tener fecha de inicio y fin.
         */
        if (
          !appointment.startDateTime?.dateTime ||
          !appointment.endDateTime?.dateTime
        ) {
          return false;
        }

        const appointmentStart = new Date(
          appointment.startDateTime.dateTime,
        );

        const appointmentEnd = new Date(
          appointment.endDateTime.dateTime,
        );

        /*
         * Solo nos interesan citas dentro del rango
         * consultado.
         */
        return (
          appointmentEnd > now &&
          appointmentStart < end
        );
      })
      .map((appointment) => ({
        id: appointment.id,
        startDateTime:
          appointment.startDateTime,
        endDateTime:
          appointment.endDateTime,
      }));

    /*
     * =========================================================
     * DIAGNÓSTICO
     * =========================================================
     */

    console.log(
      "DISPONIBILIDAD MICROSOFT:",
      JSON.stringify(availability, null, 2),
    );

    console.log(
      "CITAS DEL MENTOR:",
      JSON.stringify(bookedAppointments, null, 2),
    );

    /*
     * =========================================================
     * RESPUESTA
     * =========================================================
     */

    return NextResponse.json({
      staffId,
      businessId,
      services,
      availability,
      bookedAppointments,
    });
  } catch (error) {
    console.error(
      "Error obteniendo horarios del mentor:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo obtener la disponibilidad del mentor.",
      },
      {
        status: 500,
      },
    );
  }
}