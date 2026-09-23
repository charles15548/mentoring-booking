 
import { NextResponse } from "next/server";
import type { CreateBookingInput } from "@/models/booking.model";
import {
  getBookingBusinessId,
  graphRequest,
  toGraphLocalDateTime,
} from "@/lib/microsoft-graph";
import { supabase } from "@/lib/supabase";




 
// OBETENER reservas por email
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
            timeZone?: string;
          };
          endDateTime?: {
            dateTime: string;
            timeZone?: string;
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

    const userAppointments = 
      (appointmentsData.value || []).filter(
        (appointment) =>
       appointment.customers?.some(
        (customer) =>
          customer.emailAddress
        ?.trim()
        .toLowerCase() === email 
       )
    );

    const bookingIds = userAppointments.map(
      (appointments) => appointments.id,
    );

    const {data: confirmationsData} = await supabase
    .from("appointment_confirmations")
.select("microsoft_booking_id, confirmed, confirmed_at, confirmed_by")
    .in(
      "microsoft_booking_id",
      bookingIds,
    );

    const confirmationsMap = new Map(
      (confirmationsData || []).map(
        (confirmation) => [
          confirmation.microsoft_booking_id,
          confirmation
        ]
      )
    )
    // construir respuesta
    const reservations = userAppointments.map(
      (appointment) => {
        const mentorId = appointment.staffMemberIds?.[0];

        const mentor = mentorId ? staffMap.get(mentorId) : undefined;

        const customer = appointment.customers?.find(
          (customer) => customer.emailAddress?.trim().toLowerCase() === email,
        );
        const confirmation = confirmationsMap.get(appointment.id);
        const confirmed = confirmation?.confirmed=== true;
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
        
          confirmed: confirmation?.confirmed ?? false ,
          confirmedAt: confirmation?.confirmed_at?? null,
          status: confirmed ? "Confirmada": "Pendiente",
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

// =========================================================
// GET
// OBTENER RESERVAS DEL MENTEE
// =========================================================

// export async function GET(request: Request) {
//   try {
//     const authHeader =
//       request.headers.get("authorization");

//     const token =
//       authHeader?.replace("Bearer ", "");

//     const { data: authData } =
//       await supabase.auth.getUser(token);

//     const email =
//       authData.user?.email
//         ?.trim()
//         .toLowerCase();

//     const businessId =
//       getBookingBusinessId();

//     const [appointmentsData, staffData] =
//       await Promise.all([
//         graphRequest<{
//           value?: Array<{
//             id: string;
//             serviceName?: string;
//             staffMemberIds?: string[];
//             startDateTime?: {
//               dateTime: string;
//             };
//             endDateTime?: {
//               dateTime: string;
//             };
//             customers?: Array<{
//               name?: string;
//               emailAddress?: string;
//             }>;
//           }>;
//         }>(
//           `/solutions/bookingBusinesses/${encodeURIComponent(
//             businessId,
//           )}/appointments`,
//         ),

//         graphRequest<{
//           value?: Array<{
//             id: string;
//             displayName?: string;
//             emailAddress?: string;
//           }>;
//         }>(
//           `/solutions/bookingBusinesses/${encodeURIComponent(
//             businessId,
//           )}/staffMembers`,
//         ),
//       ]);

//     const staffMap = new Map(
//       (staffData.value || []).map(
//         (staff) => [
//           staff.id,
//           staff,
//         ],
//       ),
//     );

//     const userAppointments =
//       (appointmentsData.value || []).filter(
//         (appointment) =>
//           appointment.customers?.some(
//             (customer) =>
//               customer.emailAddress
//                 ?.trim()
//                 .toLowerCase() ===
//               email,
//           ),
//       );

//     const bookingIds =
//       userAppointments.map(
//         (appointment) =>
//           appointment.id,
//       );

//     const {
//       data: confirmationsData,
//     } = await supabase
//       .from(
//         "appointment_confirmations",
//       )
//       .select(
//         "microsoft_booking_id, confirmed, confirmed_at, confirmed_by",
//       )
//       .in(
//         "microsoft_booking_id",
//         bookingIds,
//       );

    
//     const confirmationMap =
//       new Map(
//         (
//           confirmationsData || []
//         ).map(
//           (confirmation) => [
//             confirmation.microsoft_booking_id,
//             confirmation,
//           ],
//         ),
//       );

//     const reservations =
//       userAppointments.map(
//         (appointment) => {
//           const mentorId =
//             appointment
//               .staffMemberIds?.[0];

//           const mentor =
//             mentorId
//               ? staffMap.get(
//                   mentorId,
//                 )
//               : undefined;

//           const customer =
//             appointment.customers?.find(
//               (customer) =>
//                 customer.emailAddress
//                   ?.trim()
//                   .toLowerCase() ===
//                 email,
//             );

//           const confirmation =
//             confirmationMap.get(
//               appointment.id,
//             );

//           return {
//             id:
//               appointment.id,

//             serviceName:
//               appointment.serviceName ||
//               "Sesión de mentoría",

//             customerName:
//               customer?.name,

//             customerEmail:
//               customer?.emailAddress,

//             mentorId,

//             mentorName:
//               mentor?.displayName ||
//               "Mentor PROUNI",

//             mentorEmail:
//               mentor?.emailAddress,

//             startDateTime:
//               appointment.startDateTime,

//             endDateTime:
//               appointment.endDateTime,

//             confirmed:
//               confirmation?.confirmed ??
//               false,

//             confirmedAt:
//               confirmation
//                 ?.confirmed_at ??
//               null,

//             status:
//               confirmation?.confirmed
//                 ? "Confirmada"
//                 : "Pendiente",
//           };
//         },
//       );

//     return NextResponse.json(
//       reservations,
//     );
//   } catch (error) {
//     console.error(
//       "Error consultando reservas:",
//       error,
//     );

//     return NextResponse.json(
//       {
//         error:
//           "No se pudieron consultar las reservas",
//       },
//       {
//         status: 500,
//       },
//     );
//   }
// }

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
