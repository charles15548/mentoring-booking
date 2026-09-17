import { NextResponse } from "next/server";
import {
  graphRequest,
  getBookingBusinessId,
} from "@/lib/microsoft-graph";

interface GraphBookingBusiness {
  id: string;
  displayName: string;
}

interface GraphStaffMember {
  id: string;
  displayName: string;
  emailAddress?: string;
  role?: string;
}

export async function GET() {
  try {
    const businessId = getBookingBusinessId();

    // Obtiene únicamente el Booking configurado en .env.local
    const business = await graphRequest<GraphBookingBusiness>(
      `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}`
    );

    // Obtiene únicamente el personal de "Agendar mentorías"
    const staffResponse = await graphRequest<{
      value: GraphStaffMember[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId
      )}/staffMembers`
    );

    // Cada miembro del personal se convierte en un mentor
    const mentors = staffResponse.value.map((staff) => ({
      id: staff.id,

      // Todos pertenecen al mismo Booking
      businessId: business.id,
      businessName: business.displayName,

      // El mentor real
      name: staff.displayName,

      // Su agenda se consulta solo con su staffId
      staffIds: [staff.id],

      email: staff.emailAddress ?? "",
      role: staff.role ?? "",
    }));

    return NextResponse.json(mentors);
  } catch (error) {
    console.error("Error obteniendo mentores:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los mentores de Bookings",
      },
      { status: 502 }
    );
  }
}