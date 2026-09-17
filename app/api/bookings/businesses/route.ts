import { NextResponse } from "next/server";
import { graphRequest } from "@/lib/microsoft-graph";

interface GraphBookingBusiness {
  id: string;
  displayName: string;
  businessType?: string;
}

export async function GET() {
  try {
    const result = await graphRequest<{ value: GraphBookingBusiness[] }>("/solutions/bookingBusinesses");
    return NextResponse.json(result.value.map((business) => ({
      id: business.id,
      name: business.displayName,
      type: business.businessType ?? "",
    })));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron obtener las páginas de Bookings" }, { status: 500 });
  }
}