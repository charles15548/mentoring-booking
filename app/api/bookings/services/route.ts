import { NextResponse } from "next/server";
import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";

interface GraphService {
  id: string;
  displayName: string;
  defaultDuration?: string;
  maximumAttendeesCount?: number;
  staffMemberIds?: string[];
  isLocationOnline?: boolean;
}

export async function GET(request: Request) {
  try {
    const businessId =
      new URL(request.url).searchParams.get("businessId") ??
      getBookingBusinessId();
    const result = await graphRequest<{ value: GraphService[] }>(
      `/solutions/bookingBusinesses/${businessId}/services`,
    );
    return NextResponse.json(
      result.value.map((service) => ({
        ...service,
        name: service.displayName,
        duration: service.defaultDuration,
        maximumAttendeesCount: service.maximumAttendeesCount,
        staffMemberIds: service.staffMemberIds ?? [],
        isLocationOnline: service.isLocationOnline ?? true,
      })),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los servicios",
      },
      { status: 500 },
    );
  }
}
