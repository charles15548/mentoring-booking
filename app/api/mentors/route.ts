
import { NextResponse } from "next/server";
import {
  graphRequest,
  getBookingBusinessId,
} from "@/lib/microsoft-graph";

interface GraphStaffMember {
  id: string;
  displayName: string;
  emailAddress?: string;
  role?: string;
}

export async function GET() {
  try {
    const businessId = getBookingBusinessId();

    const result = await graphRequest<{
      value: GraphStaffMember[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers`,
    );

    const mentors = result.value
      .filter((staff) => staff.role !== "administrator")
      .map((staff) => ({
        id: staff.id,
        name: staff.displayName,
        email: staff.emailAddress ?? "",
      }));

    return NextResponse.json(mentors);
  } catch (error) {
    console.error("Error obteniendo mentores:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los mentores",
      },
      { status: 502 },
    );
  }
}