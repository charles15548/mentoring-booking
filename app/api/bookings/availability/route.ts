import { NextResponse } from "next/server";
import { graphRequest, toGraphUtcDateTime } from "@/lib/microsoft-graph";

interface AvailabilityRequest { businessId: string; staffIds?: string[]; startDateTime: string; endDateTime: string; }

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<AvailabilityRequest>;
    if (!body.businessId || !body.startDateTime || !body.endDateTime) return NextResponse.json({ error: "Faltan datos de disponibilidad" }, { status: 400 });
    const businessId = body.businessId;
    const result = await graphRequest(`/solutions/bookingBusinesses/${businessId}/getStaffAvailability`, { method: "POST", body: JSON.stringify({ staffIds: body.staffIds ?? [], startDateTime: { dateTime: toGraphUtcDateTime(body.startDateTime), timeZone: "UTC" }, endDateTime: { dateTime: toGraphUtcDateTime(body.endDateTime), timeZone: "UTC" } }) });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo obtener la disponibilidad" }, { status: 500 });
  }
}