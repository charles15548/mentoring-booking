import { NextResponse } from "next/server";
import type { CreateBookingInput } from "@/models/booking.model";
import {
  getBookingBusinessId,
  graphRequest,
  toGraphLocalDateTime,
} from "@/lib/microsoft-graph";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notificarMentoria } from "@/lib/mentoria-mail";
import { fechaHoraMentoria } from "@/lib/mentoria-fecha";

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

interface GraphStaffMember {
  id: string;
  displayName?: string;
  emailAddress?: string;
}

interface GraphCollection<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

/* =========================================================
   PAGINACIÓN DE MICROSOFT GRAPH
========================================================= */

async function getAllGraphItems<T>(path: string): Promise<T[]> {
  const items: T[] = [];

  let nextPath: string | null = path;

  const seen = new Set<string>();

  while (nextPath) {
    if (seen.has(nextPath)) {
      throw new Error(
        "Microsoft Graph devolvió una paginación circular.",
      );
    }

    seen.add(nextPath);

    const page: GraphCollection<T> =
      await graphRequest<GraphCollection<T>>(nextPath);

    items.push(...(page.value ?? []));

    const nextLink: string | undefined = page["@odata.nextLink"];

    if (!nextLink) {
      break;
    }

    const url = new URL(
      nextLink,
      "https://graph.microsoft.com/v1.0/",
    );

    if (
      url.origin !== "https://graph.microsoft.com" ||
      !url.pathname.startsWith("/v1.0/")
    ) {
      throw new Error(
        "La paginación de Microsoft Graph no es válida.",
      );
    }

    nextPath = `${
      url.pathname.replace(/^\/v1\.0/, "")
    }${url.search}`;
  }

  return items;
}

/* =========================================================
   GET - OBTENER RESERVAS POR EMAIL
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

    const base =
      `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}`;

    const [
      appointments,
      staffMembers,
      customers,
    ] = await Promise.all([
      getAllGraphItems<GraphAppointment>(
        `${base}/appointments`,
      ),

      getAllGraphItems<GraphStaffMember>(
        `${base}/staffMembers`,
      ),

      getAllGraphItems<GraphCustomer>(
        `${base}/customers`,
      ),
    ]);

    const staffMap = new Map(
      staffMembers.map((staff) => [
        staff.id,
        staff,
      ]),
    );

    const customersMap = new Map(
      customers.map((customer) => [
        customer.id,
        customer,
      ]),
    );

    /* =====================================================
       FILTRAR RESERVAS DEL MENTEE
    ===================================================== */

    const userAppointments = appointments.filter(
      (appointment) => {
        const customerById = appointment.customerId
          ? customersMap.get(appointment.customerId)
          : undefined;

        if (
          customerById?.emailAddress
            ?.trim()
            .toLowerCase() === email
        ) {
          return true;
        }

        return appointment.customers?.some(
          (customer) =>
            customer.emailAddress
              ?.trim()
              .toLowerCase() === email,
        );
      },
    );

    /* =====================================================
       RECUPERAR MENTORES NO ENCONTRADOS
    ===================================================== */

    const missingStaffIds = [
      ...new Set(
        userAppointments
          .flatMap(
            (appointment) =>
              appointment.staffMemberIds ?? [],
          )
          .filter(
            (staffId) => !staffMap.has(staffId),
          ),
      ),
    ];

    await Promise.all(
      missingStaffIds.map(async (staffId) => {
        try {
          const staff =
            await graphRequest<GraphStaffMember>(
              `${base}/staffMembers/${encodeURIComponent(staffId)}`,
            );

          if (staff.id) {
            staffMap.set(staff.id, staff);
          }
        } catch (lookupError) {
          console.warn(
            "[bookings GET] Mentor no disponible en Graph:",
            staffId,
            lookupError,
          );
        }
      }),
    );

    /* =====================================================
       CONSULTAR CONFIRMACIONES Y ACUERDOS
    ===================================================== */

    const bookingIds = userAppointments.map(
      (appointment) => appointment.id,
    );

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
        .select(
          "microsoft_booking_id, confirmed_at, confirmed_by, status",
        )
        .in("microsoft_booking_id", bookingIds);

      confirmationsData = confirmations || [];

      const {
        data: agreements,
        error: agreementsError,
      } = await supabaseAdmin
        .from("acuerdos")
        .select("microsoft_booking_id")
        .in("microsoft_booking_id", bookingIds);

      if (agreementsError) {
        console.error(
          "Error contando acuerdos:",
          agreementsError,
        );
      }

      agreementsData = agreements || [];
    }

    const confirmationsMap = new Map(
      confirmationsData.map((confirmation) => [
        confirmation.microsoft_booking_id,
        confirmation,
      ]),
    );

    const agreementCountMap =
      new Map<string, number>();

    for (const agreement of agreementsData) {
      agreementCountMap.set(
        agreement.microsoft_booking_id,
        (
          agreementCountMap.get(
            agreement.microsoft_booking_id,
          ) ?? 0
        ) + 1,
      );
    }

    /* =====================================================
       CONSTRUIR RESPUESTA
    ===================================================== */

    const reservations = userAppointments.map(
      (appointment) => {
        const mentorId =
          appointment.staffMemberIds?.[0];

        const mentor = mentorId
          ? staffMap.get(mentorId)
          : undefined;

        if (!mentor) {
          console.warn(
            "[bookings GET] Reserva sin datos del mentor:",
            {
              bookingId: appointment.id,
              staffMemberIds:
                appointment.staffMemberIds ?? [],

              motivo: mentorId
                ? "El staffMemberId no pudo resolverse en Microsoft Graph."
                : "La reserva no tiene staffMemberIds.",
            },
          );
        }

        const customer = appointment.customerId
          ? customersMap.get(appointment.customerId)
          : undefined;

        const appointmentCustomer =
          appointment.customers?.find(
            (item) =>
              item.emailAddress
                ?.trim()
                .toLowerCase() === email,
          );

        const confirmation =
          confirmationsMap.get(appointment.id);

        return {
          id: appointment.id,

          serviceName:
            appointment.serviceName ||
            "Sesión de mentoría",

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

          mentorName:
            mentor?.displayName || null,

          mentorEmail:
            mentor?.emailAddress || null,

          startDateTime:
            appointment.startDateTime,

          endDateTime:
            appointment.endDateTime,

          confirmedAt:
            confirmation?.confirmed_at ?? null,

          status:
            confirmation?.status ?? "pendiente",

          agreementCount:
            agreementCountMap.get(
              appointment.id,
            ) ?? 0,
        };
      },
    );

    return NextResponse.json(reservations);
  } catch (error) {
    console.error(
      "Error consultando reservas:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron consultar las reservas",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   POST - CREAR RESERVA
========================================================= */

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as CreateBookingInput;

    const businessId = getBookingBusinessId();

    const customerEmail = body.customerEmail
      ?.trim()
      .toLowerCase();

    if (!customerEmail) {
      return NextResponse.json(
        {
          error:
            "El correo del mentee es obligatorio.",
        },
        { status: 400 },
      );
    }

    /* =====================================================
       BUSCAR CUSTOMER EXISTENTE EN BOOKINGS
    ===================================================== */

    const customersData = await graphRequest<{
      value?: GraphCustomer[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/customers`,
    );

    const bookingCustomer = (
      customersData.value || []
    ).find(
      (customer) =>
        customer.emailAddress
          ?.trim()
          .toLowerCase() === customerEmail,
    );

    if (!bookingCustomer) {
      return NextResponse.json(
        {
          error:
            "No se encontró el mentee en Microsoft Bookings. Primero debe existir como cliente.",
        },
        { status: 404 },
      );
    }

    console.log(
      "[booking-create] Customer encontrado:",
      {
        customerId: bookingCustomer.id,
        displayName:
          bookingCustomer.displayName,
        emailAddress:
          bookingCustomer.emailAddress,
      },
    );

    /* =====================================================
       CREAR RESERVA EN MICROSOFT BOOKINGS
    ===================================================== */

    const appointment = await graphRequest<{
      id: string;
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/appointments`,
      {
        method: "POST",

        body: JSON.stringify({
          "@odata.type":
            "#microsoft.graph.bookingAppointment",

          serviceId: body.serviceId,

          staffMemberIds: [body.staffId],

          optOutOfCustomerEmail: true,

          customerId: bookingCustomer.id,

          customerName:
            bookingCustomer.displayName ||
            body.customerName,

          customerEmailAddress:
            bookingCustomer.emailAddress ||
            customerEmail,

          customerTimeZone:
            "SA Pacific Standard Time",

          startDateTime: {
            "@odata.type":
              "#microsoft.graph.dateTimeTimeZone",

            dateTime:
              toGraphLocalDateTime(body.startAt),

            timeZone:
              "SA Pacific Standard Time",
          },

          endDateTime: {
            "@odata.type":
              "#microsoft.graph.dateTimeTimeZone",

            dateTime:
              toGraphLocalDateTime(body.endAt),

            timeZone:
              "SA Pacific Standard Time",
          },

          "customers@odata.type":
            "#Collection(microsoft.graph.bookingCustomerInformation)",

          customers: [
            {
              "@odata.type":
                "#microsoft.graph.bookingCustomerInformation",

              customerId:
                bookingCustomer.id,

              name:
                bookingCustomer.displayName ||
                body.customerName,

              emailAddress:
                bookingCustomer.emailAddress ||
                customerEmail,

              phone:
                bookingCustomer.phones?.[0]
                  ?.number,

              timeZone:
                "SA Pacific Standard Time",
            },
          ],
        }),
      },
    );

    console.log(
      "[booking-create] Reserva creada:",
      {
        appointmentId: appointment.id,
        customerId: bookingCustomer.id,
      },
    );

    /* =====================================================
       REGISTRAR ESTADO PENDIENTE EN SUPABASE
    ===================================================== */

    const { error: confirmationError } =
      await supabase
        .from("appointment_confirmations")
        .insert({
          microsoft_booking_id:
            appointment.id,

          status: "pendiente",
        });

    if (confirmationError) {
      console.error(
        "Error guardando confirmación:",
        confirmationError,
      );
    }

    /* =====================================================
       CORREOS INSTITUCIONALES
    ===================================================== */

    if (
      process.env.PRUNI_NOTIFICACIONES_ACTIVAS ===
      "true"
    ) {
      try {
        const startLocal =
          toGraphLocalDateTime(body.startAt);

        const horario = fechaHoraMentoria({
          dateTime: startLocal,

          timeZone:
            "SA Pacific Standard Time",
        });

        const staffResponse =
          await graphRequest<{
            value?: Array<{
              id: string;
              displayName?: string;
              emailAddress?: string;
            }>;
          }>(
            `/solutions/bookingBusinesses/${encodeURIComponent(
              businessId,
            )}/staffMembers`,
          );

        const staffData =
          staffResponse.value?.find(
            (staff) =>
              staff.id === body.staffId,
          );

        if (horario) {
          const datos = {
            mentorNombre:
              staffData?.displayName ||
              "Mentor ProUni",

            menteeNombre:
              bookingCustomer.displayName ||
              body.customerName ||
              "Mentee ProUni",

            menteeEmail:
              customerEmail,

            fecha: horario.fecha,

            hora: horario.hora,
          };

          const results =
            await Promise.allSettled([
              notificarMentoria({
                bookingId: appointment.id,

                event:
                  "solicitud-mentee",

                recipient:
                  customerEmail,

                data: datos,
              }),

              ...(staffData?.emailAddress
                ? [
                    notificarMentoria({
                      bookingId:
                        appointment.id,

                      event:
                        "solicitud-mentor" as const,

                      recipient:
                        staffData.emailAddress,

                      data: datos,
                    }),
                  ]
                : []),
            ]);

          for (const result of results) {
            if (
              result.status === "rejected"
            ) {
              console.error(
                "[booking-create] Error de notificación:",
                result.reason,
              );
            }
          }
        } else {
          console.error(
            "[booking-create] No se pudo interpretar la fecha para correos.",
          );
        }
      } catch (mailError) {
        console.error(
          "[booking-create] Reserva creada; error preparando correos:",
          mailError,
        );
      }
    }

    /* =====================================================
       RESPUESTA AL FRONTEND
    ===================================================== */

    return NextResponse.json(
      {
        status: "pendiente",

        appointment,

        customerId:
          bookingCustomer.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "Error creando reserva:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la reserva.",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   DELETE - CANCELAR RESERVA
========================================================= */

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      microsoftBookingId?: string;
      email?: string;
    };

    const microsoftBookingId =
      body.microsoftBookingId;

    if (!microsoftBookingId) {
      return NextResponse.json(
        {
          error:
            "Falta microsoftBookingId.",
        },
        { status: 400 },
      );
    }

    const { data: confirmation } =
      await supabase
        .from("appointment_confirmations")
        .select(
          "microsoft_booking_id, status",
        )
        .eq(
          "microsoft_booking_id",
          microsoftBookingId,
        )
        .maybeSingle();

    if (
      confirmation?.status?.toLowerCase() ===
      "confirmada"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta mentoría ya fue confirmada y no se puede cancelar.",
        },
        { status: 409 },
      );
    }

    const businessId =
      getBookingBusinessId();

    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/appointments/${encodeURIComponent(
        microsoftBookingId,
      )}/cancel`,
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
      .eq(
        "microsoft_booking_id",
        microsoftBookingId,
      );

    return NextResponse.json({
      success: true,

      message:
        "La reserva fue cancelada correctamente.",
    });
  } catch (error) {
    const err = error as Error;

    return NextResponse.json(
      {
        error: err.message,
      },
      { status: 500 },
    );
  }
}