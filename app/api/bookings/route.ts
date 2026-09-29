 
import { NextResponse } from "next/server";
import type { CreateBookingInput } from "@/models/booking.model";
import {
  getBookingBusinessId,
  graphRequest,
  toGraphLocalDateTime,
} from "@/lib/microsoft-graph";
import { supabase } from "@/lib/supabase";
import { error } from "console";
import {
  supabaseAdmin,
} from "@/lib/supabase-admin";




 
// OBETENER reservas por email
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams
    .get("email")
    ?.trim()
    .toLowerCase();

  
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
.select("microsoft_booking_id, confirmed_at, confirmed_by, status")
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
    const { data: agreementsData, error: agreementsError } = await supabaseAdmin
      .from("acuerdos")
      .select("microsoft_booking_id")
      .in("microsoft_booking_id", bookingIds);

    if (agreementsError) {
      console.error("Error contando acuerdos:", agreementsError);
    }

    const agreementCountMap = new Map<string, number>();

    for (const agreement of agreementsData ?? []) {
      agreementCountMap.set(
        agreement.microsoft_booking_id,
        (agreementCountMap.get(agreement.microsoft_booking_id) ?? 0) + 1,
      );
    }
    // construir respuesta
    const reservations = userAppointments.map(
      (appointment) => {
        const mentorId = appointment.staffMemberIds?.[0];

        const mentor = mentorId ? staffMap.get(mentorId) : undefined;

        const customer = appointment.customers?.find(
          (customer) => customer.emailAddress?.trim().toLowerCase() === email,
        );
        const confirmation = confirmationsMap.get(appointment.id);
      
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
        
          confirmedAt: confirmation?.confirmed_at?? null,
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
========================================================= */

 
export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as CreateBookingInput;

    const businessId =
      getBookingBusinessId();

    const appointment =
      await graphRequest<{
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

            serviceId:
              body.serviceId,

            staffMemberIds: [
              body.staffId,
            ],

            customerName:
              body.customerName,

            customerEmailAddress:
              body.customerEmail,

            customerTimeZone:
              "SA Pacific Standard Time",

            startDateTime: {
              "@odata.type":
                "#microsoft.graph.dateTimeTimeZone",
              dateTime:
                toGraphLocalDateTime(
                  body.startAt,
                ),
              timeZone:
                "SA Pacific Standard Time",
            },

            endDateTime: {
              "@odata.type":
                "#microsoft.graph.dateTimeTimeZone",
              dateTime:
                toGraphLocalDateTime(
                  body.endAt,
                ),
              timeZone:
                "SA Pacific Standard Time",
            },

            "customers@odata.type":
              "#Collection(microsoft.graph.bookingCustomerInformation)",

            customers: [
              {
                "@odata.type":
                  "#microsoft.graph.bookingCustomerInformation",
                name:
                  body.customerName,
                emailAddress:
                  body.customerEmail,
                timeZone:
                  "SA Pacific Standard Time",
              },
            ],
          }),
        },
      );

    await supabase
      .from("appointment_confirmations")
      .insert({
        microsoft_booking_id:
          appointment.id,
        status: "pendiente",
      });

    return NextResponse.json(
      {
        status: "pendiente",
        appointment,
      },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }
}


/* =========================================================
   DELETE
   CANCELAR UNA RESERVA
   Solo si todavía NO fue confirmada por el mentor
========================================================= */

export async function DELETE(request:Request) {
  try{
    const body = (await request.json()) as{
      microsoftBookingId?: string;
      email?: string;
    };

    const microsoftBookingId= body.microsoftBookingId;
   
    
        if (!microsoftBookingId) {
      return NextResponse.json(
        {error:"Falta microsoftBookingId."},
        {status: 400},
      );
    }
    const {data:confirmation} = await supabase
    .from("appointment_confirmations")
    .select('microsoft_booking_id, status')
    .eq('microsoft_booking_id', microsoftBookingId)
    .maybeSingle();

    // si esta confirmada, no se puede cancelar
    if(confirmation?.status?.toLowerCase() === "confirmada"){
      return NextResponse.json(
        { error: "Esta mentoria ya fue confirmada y no se puede cancelar."},
        {status: 409}
      );
    }

    // Obtener cita de microsoft
    const businessId = getBookingBusinessId();
 
    // Cancelar reserva
    await graphRequest(
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId
    )}/appointments/${encodeURIComponent(
      microsoftBookingId
    )}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        cancellationMessage: "La sesión de mentoría fue cancelada por el mentee."
      })
    }
    )
    await supabase
      .from("appointment_confirmations")
      .update({ status: "cancelada" })
      .eq("microsoft_booking_id", microsoftBookingId);
    // repuesta
    return NextResponse.json({
      seccess: true,
      message: "La reserva fue canselada correctamente"
    });
  }   catch (error) {
  const err = error as Error;

  return NextResponse.json(
    { error: err.message },
    { status: 500 },
  );
}
}
