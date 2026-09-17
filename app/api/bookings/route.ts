import { NextResponse } from "next/server";
import type { CreateBookingInput } from "@/models/booking.model";
import { graphRequest } from "@/lib/microsoft-graph";

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
            dateTime: "2026-09-18T09:00:00.0000000",
            timeZone: "SA Pacific Standard Time",
          },

          endDateTime: {
            "@odata.type": "#microsoft.graph.dateTimeTimeZone",
            dateTime: "2026-09-18T09:30:00.0000000",
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
