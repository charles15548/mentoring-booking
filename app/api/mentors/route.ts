import { NextResponse } from "next/server";
import { graphRequest } from "@/lib/microsoft-graph";

interface GraphBookingBusiness { id: string; displayName: string; }
interface GraphStaffMember { id: string; displayName: string; emailAddress?: string; role?: string; }

export async function GET() {
  try {
    const businesses = await graphRequest<{ value: GraphBookingBusiness[] }>("/solutions/bookingBusinesses");
    const agendas = await Promise.all(businesses.value.map(async (business) => {
      const staffResponse = await graphRequest<{ value: GraphStaffMember[] }>(`/solutions/bookingBusinesses/${business.id}/staffMembers`);
      return {
        id: business.id,
        businessId: business.id,
        businessName: business.displayName,
        name: business.displayName,
        staffIds: staffResponse.value.map((staff) => staff.id),
        staff: staffResponse.value.map((staff) => ({ id: staff.id, name: staff.displayName, email: staff.emailAddress ?? "", role: staff.role ?? "" })),
      };
    }));
    return NextResponse.json(agendas);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron obtener las agendas de Bookings" }, { status: 502 });
  }
}
