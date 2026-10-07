import { NextResponse } from "next/server";
import type { CreateBookingInput } from "@/models/booking.model";
import {
  getBookingBusinessId,
  graphRequest,
  toGraphLocalDateTime,
} from "@/lib/microsoft-graph";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

/* =========================================================
   TIPOS
========================================================= */

interface GraphCustomer {
  id: string;
  displayName?: string;
  emailAddress?: string;
  phones?: Array<{
    number?: string;
    type?: string;
  }>;
}

interface GraphAppointmentCustomer {
  "@odata.type"?: string;
  customerId?: string;
  name?: string;
  emailAddress?: string;
  phone?: string;
  timeZone?: string;
}

interface GraphAppointment {
  id: string;
  serviceName?: string;
  staffMemberIds?: string[];

  customerId?: string;
  customerName?: string;
  customerEmailAddress?: string;
  customerPhone?: string;

  startDateTime?: {
    dateTime: string;
    timeZone?: string;
  };

  endDateTime?: {
    dateTime: string;
    timeZone?: string;
  };

  customers?: GraphAppointmentCustomer[];
}

/* =========================================================
   GET
   OBTENER RESERVAS POR EMAIL
========================================================= */

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams
    .get("email")
    ?.trim()
    .toLowerCase();

  try {
    if (!email) {
      return NextResponse.json(
        { error: "Falta el correo del mentee." },
        { status: 400 },
      );
    }

    const businessId = getBookingBusinessId();

    // Obtener citas, mentores y customers de Microsoft
    const [appointmentsData, staffData, customersData] = await Promise.all([
      graphRequest<{
        value?: GraphAppointment[];
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

      graphRequest<{
        value?: GraphCustomer[];
      }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/customers`,
      ),
    ]);

    // Crear mapa de mentores
    const staffMap = new Map(
      (staffData.value || []).map((staff) => [staff.id, staff]),
    );

    // Crear mapa de customers por ID
    const customersMap = new Map(
      (customersData.value || []).map((customer) => [customer.id, customer]),
    );

    /*
      Buscar reservas del usuario.

      Primero intentamos por customerId.
      Como las reservas antiguas pueden no tener customerId,
      también mantenemos la búsqueda por email.
    */
    const userAppointments = (appointmentsData.value || []).filter(
      (appointment) => {
        const customerById = appointment.customerId
          ? customersMap.get(appointment.customerId)
          : undefined;

        if (customerById?.emailAddress?.trim().toLowerCase() === email) {
          return true;
        }

        return appointment.customers?.some(
          (customer) => customer.emailAddress?.trim().toLowerCase() === email,
        );
      },
    );

    const bookingIds = userAppointments.map((appointment) => appointment.id);

    /*
      Si no hay reservas, evitamos enviar un .in() vacío
      a Supabase.
    */
    let confirmationsData: Array<{
      microsoft_booking_id: string;
      confirmed_at: string | null;
      confirmed_by: string | null;
      status: string;
    }> = [];

    let agreementsData: Array<{
      microsoft_booking_id: string;
    }> = [];

    if (bookingIds.length > 0) {
      const { data: confirmations } = await supabase
        .from("appointment_confirmations")
        .select("microsoft_booking_id, confirmed_at, confirmed_by, status")
        .in("microsoft_booking_id", bookingIds);

      confirmationsData = confirmations || [];

      const { data: agreements, error: agreementsError } = await supabaseAdmin
        .from("acuerdos")
        .select("microsoft_booking_id")
        .in("microsoft_booking_id", bookingIds);

      if (agreementsError) {
        console.error("Error contando acuerdos:", agreementsError);
      }

      agreementsData = agreements || [];
    }

    const confirmationsMap = new Map(
      confirmationsData.map((confirmation) => [
        confirmation.microsoft_booking_id,
        confirmation,
      ]),
    );

    const agreementCountMap = new Map<string, number>();

    for (const agreement of agreementsData) {
      agreementCountMap.set(
        agreement.microsoft_booking_id,
        (agreementCountMap.get(agreement.microsoft_booking_id) ?? 0) + 1,
      );
    }

    // Construir respuesta
    const reservations = userAppointments.map((appointment) => {
      const mentorId = appointment.staffMemberIds?.[0];

      const mentor = mentorId ? staffMap.get(mentorId) : undefined;

      /*
            Buscar primero la información vinculada
            por customerId.
          */
      let customer = appointment.customerId
        ? customersMap.get(appointment.customerId)
        : undefined;

      /*
            Compatibilidad con reservas antiguas
            que no tienen customerId.
          */
      const appointmentCustomer = appointment.customers?.find(
        (customer) => customer.emailAddress?.trim().toLowerCase() === email,
      );

      const confirmation = confirmationsMap.get(appointment.id);

      return {
        id: appointment.id,

        serviceName: appointment.serviceName || "Sesión de mentoría",

        customerName:
          customer?.displayName ??
          appointment.customerName ??
          appointmentCustomer?.name,

        customerEmail:
          customer?.emailAddress ??
          appointment.customerEmailAddress ??
          appointmentCustomer?.emailAddress,

        customerId:
          appointment.customerId ??
          appointmentCustomer?.customerId ??
          customer?.id ??
          null,

        mentorId,

        mentorName: mentor?.displayName || "Mentor PROUNI",

        mentorEmail: mentor?.emailAddress,

        startDateTime: appointment.startDateTime,

        endDateTime: appointment.endDateTime,

        confirmedAt: confirmation?.confirmed_at ?? null,

        status: confirmation?.status ?? "pendiente",

        agreementCount: agreementCountMap.get(appointment.id) ?? 0,
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

   IMPORTANTE:
   Ahora buscamos el bookingCustomer real de Microsoft
   para guardar su customerId en la cita.

   Esto evita crear una relación independiente entre
   la cita y el nombre del mentee.
========================================================= */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateBookingInput;

    const businessId = getBookingBusinessId();

    const customerEmail = body.customerEmail?.trim().toLowerCase();

    if (!customerEmail) {
      return NextResponse.json(
        {
          error: "El correo del mentee es obligatorio.",
        },
        {
          status: 400,
        },
      );
    }

    /*
      Buscar el customer existente en Microsoft Bookings.
    */
    const customersData = await graphRequest<{
      value?: GraphCustomer[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/customers`,
    );

    const bookingCustomer = (customersData.value || []).find(
      (customer) =>
        customer.emailAddress?.trim().toLowerCase() === customerEmail,
    );

    if (!bookingCustomer) {
      return NextResponse.json(
        {
          error:
            "No se encontró el mentee en Microsoft Bookings. Primero debe existir como cliente.",
        },
        {
          status: 404,
        },
      );
    }

    console.log("[booking-create] Customer encontrado en Microsoft:", {
      customerId: bookingCustomer.id,

      displayName: bookingCustomer.displayName,

      emailAddress: bookingCustomer.emailAddress,
    });

    const appointment = await graphRequest<{
      id: string;
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/appointments`,
      {
        method: "POST",

        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.bookingAppointment",

          serviceId: body.serviceId,

          staffMemberIds: [body.staffId],

          /*
                También mantenemos estos campos
                por compatibilidad con Microsoft Bookings.
              */
          customerId: bookingCustomer.id,

          customerName: bookingCustomer.displayName || body.customerName,

          customerEmailAddress: bookingCustomer.emailAddress || customerEmail,

          customerTimeZone: "SA Pacific Standard Time",

          startDateTime: {
            "@odata.type": "#microsoft.graph.dateTimeTimeZone",

            dateTime: toGraphLocalDateTime(body.startAt),

            timeZone: "SA Pacific Standard Time",
          },

          endDateTime: {
            "@odata.type": "#microsoft.graph.dateTimeTimeZone",

            dateTime: toGraphLocalDateTime(body.endAt),

            timeZone: "SA Pacific Standard Time",
          },

          "customers@odata.type":
            "#Collection(microsoft.graph.bookingCustomerInformation)",

          customers: [
            {
              "@odata.type": "#microsoft.graph.bookingCustomerInformation",

              customerId: bookingCustomer.id,

              name: bookingCustomer.displayName || body.customerName,

              emailAddress: bookingCustomer.emailAddress || customerEmail,

              phone: bookingCustomer.phones?.[0]?.number,

              timeZone: "SA Pacific Standard Time",
            },
          ],
        }),
      },
    );

    console.log("[booking-create] Reserva creada:", {
      appointmentId: appointment.id,

      customerId: bookingCustomer.id,
    });

    const { error: confirmationError } = await supabase
      .from("appointment_confirmations")
      .insert({
        microsoft_booking_id: appointment.id,

        status: "pendiente",
      });

    if (confirmationError) {
      console.error("Error guardando confirmación:", confirmationError);
    }

    return NextResponse.json(
      {
        status: "pendiente",

        appointment,

        customerId: bookingCustomer.id,
      },
      {
        status: 201,
      },
    );
  } catch (error: any) {
    console.error("Error creando reserva:", error);

    return NextResponse.json(
      {
        error: error?.message || "No se pudo crear la reserva.",
      },
      {
        status: 500,
      },
    );
  }
}

/* =========================================================
   DELETE
   CANCELAR UNA RESERVA

   Solo si todavía NO fue confirmada por el mentor.
========================================================= */

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      microsoftBookingId?: string;
      email?: string;
    };

    const microsoftBookingId = body.microsoftBookingId;

    if (!microsoftBookingId) {
      return NextResponse.json(
        {
          error: "Falta microsoftBookingId.",
        },
        {
          status: 400,
        },
      );
    }

    const { data: confirmation } = await supabase
      .from("appointment_confirmations")
      .select("microsoft_booking_id, status")
      .eq("microsoft_booking_id", microsoftBookingId)
      .maybeSingle();

    // Si está confirmada, no se puede cancelar.
    if (confirmation?.status?.toLowerCase() === "confirmada") {
      return NextResponse.json(
        {
          error: "Esta mentoria ya fue confirmada y no se puede cancelar.",
        },
        {
          status: 409,
        },
      );
    }

    const businessId = getBookingBusinessId();

    // Cancelar reserva en Microsoft Bookings.
    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/appointments/${encodeURIComponent(microsoftBookingId)}/cancel`,
      {
        method: "POST",

        body: JSON.stringify({
          cancellationMessage:
            "La sesión de mentoría fue cancelada por el mentee.",
        }),
      },
    );

    await supabase
      .from("appointment_confirmations")
      .update({
        status: "cancelada",
      })
      .eq("microsoft_booking_id", microsoftBookingId);

    return NextResponse.json({
      success: true,

      message: "La reserva fue cancelada correctamente.",
    });
  } catch (error) {
    const err = error as Error;

    return NextResponse.json(
      {
        error: err.message,
      },
      {
        status: 500,
      },
    );
  }
}
