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
     * 1. Obtener servicios
     */
    const servicesResponse = await graphRequest<{
      value: GraphService[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/services`,
    );

    /*
     * Microsoft puede devolver servicios con una asignación de personal
     * desactualizada. No ocultamos el servicio en esta pantalla porque
     * necesitamos mostrar los horarios que devuelve Bookings.
     * La relación original queda disponible en staffMemberIds.
     */
    const services = servicesResponse.value
      .map((service) => ({
        id: service.id,
        name: service.displayName,
        duration:
          service.defaultDuration ?? "PT30M",
        staffMemberIds: service.staffMemberIds ?? [],
      }));

    /*
     * 2. Rango próximos 14 días
     */
    const now = new Date();

    const end = new Date(
      now.getTime() +
        14 * 24 * 60 * 60 * 1000,
    );

    /*
     * 3. Obtener disponibilidad SOLO
     * del mentor seleccionado
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

    /*
     * Microsoft devuelve:
     *
     * {
     *   staffAvailabilityItem: [...]
     * }
     */
    const availability =
      availabilityResponse.value ??
      availabilityResponse.staffAvailabilityItem ??
      [];

    return NextResponse.json({
      staffId,
      businessId,
      services,
      availability,
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
