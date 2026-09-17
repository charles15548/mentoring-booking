import { NextResponse } from "next/server";
import type { CreateBookingInput } from "@/models/booking.model";
import { getBookingBusinessId, graphRequest, toGraphLocalDateTime } from "@/lib/microsoft-graph";

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Falta el correo del usuario" }, { status: 400 });
  try {
    const data = await graphRequest<{ value?: Array<Record<string, unknown>> }>(`/solutions/bookingBusinesses/${encodeURIComponent(getBookingBusinessId())}/appointments`);
    const reservations = (data.value || []).filter((appointment) => {
      const customers = appointment.customers as Array<{ emailAddress?: string }> | undefined;
      return customers?.some((customer) => customer.emailAddress?.toLowerCase() === email);
    });
    return NextResponse.json(reservations);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron consultar las reservas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<CreateBookingInput>;

  if (
    !body.businessId ||
    !body.startAt ||
    !body.endAt ||
    !body.staffId ||
    !body.serviceId ||
    !body.customerName ||
    !body.customerEmail
  ) {
    return NextResponse.json(
      { error: "Datos de reserva incompletos" },
      { status: 400 },
    );
  }

  try {
    const appointment = await graphRequest(
      `/solutions/bookingBusinesses/${body.businessId}/appointments`,
      {
        method: "POST",
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.bookingAppointment",

          serviceId: body.serviceId,

          staffMemberIds: [body.staffId],

          customerName: body.customerName,
          customerEmailAddress: body.customerEmail,
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
              name: body.customerName,
              emailAddress: body.customerEmail,
              timeZone: "SA Pacific Standard Time",
            },
          ],
        }),
      },
    );

    return NextResponse.json(
      {
        status: "confirmed",
        appointment,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la reserva",
      },
      { status: 500 },
    );
  }
}
