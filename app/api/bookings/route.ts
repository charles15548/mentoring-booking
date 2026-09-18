// import { NextResponse } from "next/server";
// import type { CreateBookingInput } from "@/models/booking.model";
// import {
//   getBookingBusinessId,
//   graphRequest,
//   toGraphLocalDateTime,
// } from "@/lib/microsoft-graph";

// export async function GET(request: Request) {
//   const email = new URL(request.url).searchParams
//     .get("email")
//     ?.trim()
//     .toLowerCase();
//   if (!email)
//     return NextResponse.json(
//       { error: "Falta el correo del usuario" },
//       { status: 400 },
//     );
//   try {
//     const data = await graphRequest<{ value?: Array<Record<string, unknown>> }>(
//       `/solutions/bookingBusinesses/${encodeURIComponent(getBookingBusinessId())}/appointments`,
//     );
//     const reservations = (data.value || []).filter((appointment) => {
//       const customers = appointment.customers as
//         | Array<{ emailAddress?: string }>
//         | undefined;
//       return customers?.some(
//         (customer) => customer.emailAddress?.toLowerCase() === email,
//       );
//     });
//     return NextResponse.json(reservations);
//   } catch (error) {
//     return NextResponse.json(
//       {
//         error:
//           error instanceof Error
//             ? error.message
//             : "No se pudieron consultar las reservas",
//       },
//       { status: 500 },
//     );
//   }
// }

// export async function POST(request: Request) {
//   const body = (await request.json()) as Partial<CreateBookingInput>;

//   if (
//     !body.businessId ||
//     !body.startAt ||
//     !body.endAt ||
//     !body.staffId ||
//     !body.serviceId ||
//     !body.customerName ||
//     !body.customerEmail
//   ) {
//     return NextResponse.json(
//       { error: "Datos de reserva incompletos" },
//       { status: 400 },
//     );
//   }

//   try {
//     const appointment = await graphRequest(
//       `/solutions/bookingBusinesses/${body.businessId}/appointments`,
//       {
//         method: "POST",
//         body: JSON.stringify({
//           "@odata.type": "#microsoft.graph.bookingAppointment",

//           serviceId: body.serviceId,

//           staffMemberIds: [body.staffId],

//           customerName: body.customerName,
//           customerEmailAddress: body.customerEmail,
//           customerTimeZone: "SA Pacific Standard Time",

//           startDateTime: {
//             "@odata.type": "#microsoft.graph.dateTimeTimeZone",
//             dateTime: toGraphLocalDateTime(body.startAt),
//             timeZone: "SA Pacific Standard Time",
//           },

//           endDateTime: {
//             "@odata.type": "#microsoft.graph.dateTimeTimeZone",
//             dateTime: toGraphLocalDateTime(body.endAt),
//             timeZone: "SA Pacific Standard Time",
//           },

//           "customers@odata.type":
//             "#Collection(microsoft.graph.bookingCustomerInformation)",

//           customers: [
//             {
//               "@odata.type": "#microsoft.graph.bookingCustomerInformation",
//               name: body.customerName,
//               emailAddress: body.customerEmail,
//               timeZone: "SA Pacific Standard Time",
//             },
//           ],
//         }),
//       },
//     );

//     return NextResponse.json(
//       {
//         status: "confirmed",
//         appointment,
//       },
//       { status: 201 },
//     );
//   } catch (error) {
//     return NextResponse.json(
//       {
//         error:
//           error instanceof Error
//             ? error.message
//             : "No se pudo crear la reserva",
//       },
//       { status: 500 },
//     );
//   }
// }

import { NextResponse } from "next/server";
import type { CreateBookingInput } from "@/models/booking.model";
import {
  getBookingBusinessId,
  graphRequest,
  toGraphLocalDateTime,
} from "@/lib/microsoft-graph";

/* =========================================================
   GET
   LISTAR RESERVAS DEL USUARIO POR CORREO
========================================================= */

// export async function GET(request: Request) {
//   const email = new URL(request.url)
//     .searchParams
//     .get("email")
//     ?.trim()
//     .toLowerCase();

//   if (!email) {
//     return NextResponse.json(
//       {
//         error: "Falta el correo del usuario",
//       },
//       {
//         status: 400,
//       },
//     );
//   }

//   try {
//     const businessId = getBookingBusinessId();

//     const data = await graphRequest<{
//       value?: Array<Record<string, unknown>>;
//     }>(
//       `/solutions/bookingBusinesses/${encodeURIComponent(
//         businessId,
//       )}/appointments`,
//     );

//     const reservations = (data.value || []).filter(
//       (appointment) => {
//         const customers = appointment.customers as
//           | Array<{
//               emailAddress?: string;
//             }>
//           | undefined;

//         return customers?.some(
//           (customer) =>
//             customer.emailAddress?.toLowerCase() === email,
//         );
//       },
//     );

//     return NextResponse.json(reservations);
//   } catch (error) {
//     console.error(
//       "Error consultando reservas:",
//       error,
//     );

//     return NextResponse.json(
//       {
//         error:
//           error instanceof Error
//             ? error.message
//             : "No se pudieron consultar las reservas",
//       },
//       {
//         status: 500,
//       },
//     );
//   }
// }

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams
    .get("email")
    ?.trim()
    .toLowerCase();

  if (!email) {
    return NextResponse.json(
      { error: "Falta el correo del usuario" },
      { status: 400 },
    );
  }

  try {
    const businessId = getBookingBusinessId();

    // Obtener citas y mentores
    const [appointmentsData, staffData] = await Promise.all([
      graphRequest<{
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
          customers?: Array<{
            name?: string;
            emailAddress?: string;
          }>;
        }>;
      }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/appointments`,
      ),

      graphRequest<{
        value?: Array<{
          id: string;
          displayName?: string;
          emailAddress?: string;
        }>;
      }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/staffMembers`,
      ),
    ]);

    // Crear mapa de mentores
    const staffMap = new Map(
      (staffData.value || []).map((staff) => [staff.id, staff]),
    );

    // Filtrar reservas del usuario
    const reservations = (appointmentsData.value || [])
      .filter((appointment) =>
        appointment.customers?.some(
          (customer) => customer.emailAddress?.toLowerCase() === email,
        ),
      )
      .map((appointment) => {
        const mentorId = appointment.staffMemberIds?.[0];

        const mentor = mentorId ? staffMap.get(mentorId) : undefined;

        const customer = appointment.customers?.find(
          (customer) => customer.emailAddress?.toLowerCase() === email,
        );
        return {
          id: appointment.id,
          serviceName: appointment.serviceName || "Sesión de mentoría",
          customerName: customer?.name,
          customerEmail: customer?.emailAddress,
          mentorId,
          mentorName: mentor?.displayName || "Mentor PROUNI",
          mentorEmail: mentor?.emailAddress,
          startDateTime: appointment.startDateTime,
          endDateTime: appointment.endDateTime,
          status: "Confirmada",
        };
      });

    return NextResponse.json(reservations);
  } catch (error) {
    console.error("Error consultando reservas:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar las reservas",
      },
      {
        status: 500,
      },
    );
  }
}

/* =========================================================
   POST
   CREAR RESERVA
========================================================= */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateBookingInput>;

    /* =====================================================
       VALIDACIÓN
    ===================================================== */

    if (
      !body.startAt ||
      !body.endAt ||
      !body.staffId ||
      !body.serviceId ||
      !body.customerName ||
      !body.customerEmail
    ) {
      return NextResponse.json(
        {
          error: "Datos de reserva incompletos",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       BUSINESS FIJO DESDE .env.local
    ===================================================== */

    const businessId = getBookingBusinessId();

    /* =====================================================
       CREAR CITA EN MICROSOFT BOOKINGS
    ===================================================== */

    const appointment = await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/appointments`,
      {
        method: "POST",

        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.bookingAppointment",

          /* Servicio seleccionado */
          serviceId: body.serviceId,

          /* Mentor seleccionado */
          staffMemberIds: [body.staffId],

          /* Datos principales del cliente */
          customerName: body.customerName,

          customerEmailAddress: body.customerEmail,

          customerTimeZone: "SA Pacific Standard Time",

          /* Inicio */
          startDateTime: {
            "@odata.type": "#microsoft.graph.dateTimeTimeZone",

            dateTime: toGraphLocalDateTime(body.startAt),

            timeZone: "SA Pacific Standard Time",
          },

          /* Fin */
          endDateTime: {
            "@odata.type": "#microsoft.graph.dateTimeTimeZone",

            dateTime: toGraphLocalDateTime(body.endAt),

            timeZone: "SA Pacific Standard Time",
          },

          /* Datos del cliente */
          "customers@odata.type":
            "#Collection(microsoft.graph.bookingCustomerInformation)",

          customers: [
            {
              "@odata.type": "#microsoft.graph.bookingCustomerInformation",

              name: body.customerName,

              emailAddress: body.customerEmail,

              timeZone: "SA Pacific Standard Time",
            },
          ],
        }),
      },
    );

    /* =====================================================
       RESPUESTA
    ===================================================== */

    return NextResponse.json(
      {
        status: "confirmed",
        appointment,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Error creando reserva:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la reserva",
      },
      {
        status: 500,
      },
    );
  }
}
