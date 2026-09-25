import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  graphRequest,
  getBookingBusinessId,
} from "@/lib/microsoft-graph";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

interface GraphStaffMember {
  id: string;
  displayName: string;
  emailAddress?: string;
  role?: string;
}

export async function GET(
  request: NextRequest,
) {
  try {
    /* Usuario autenticado */
    const token = request.headers
      .get("authorization")
      ?.replace("Bearer ", "");

    const {
      data: { user },
    } = await supabaseAdmin.auth.getUser(
      token!,
    );

    if (!user) {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        {
          status: 401,
        },
      );
    }

    /* Mentores asignados al mentee */
    const { data: assignments } =
      await supabaseAdmin
        .from("mentor_assignments")
        .select("mentor_id")
        .eq(
          "mentee_id",
          user.id,
        );

    const mentorIds =
      assignments?.map(
        (item) =>
          item.mentor_id,
      ) ?? [];

    if (!mentorIds.length) {
      return NextResponse.json([]);
    }

    /* Obtener microsoft_staff_id */
    const { data: profiles } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "id, microsoft_staff_id",
        )
        .in("id", mentorIds)
        .eq("rol", "mentor")
        .eq("activo", true);

    const staffIds = new Set(
      (profiles ?? [])
        .map(
          (profile) =>
            profile.microsoft_staff_id,
        )
        .filter(Boolean),
    );

    if (!staffIds.size) {
      return NextResponse.json([]);
    }

    /* Microsoft Bookings */
    const businessId =
      getBookingBusinessId();

    const result =
      await graphRequest<{
        value:
          GraphStaffMember[];
      }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/staffMembers`,
      );

    /* Solo mentores asignados */
    const mentors =
      result.value
        .filter(
          (staff) =>
            staffIds.has(
              staff.id,
            ),
        )
        .map(
          (staff) => ({
            id:
              staff.id,

            name:
              staff.displayName,

            email:
              staff.emailAddress ??
              "",
          }),
        );

    return NextResponse.json(
      mentors,
    );
  } catch (error) {
    console.error(
      "Error obteniendo mentores:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los mentores",
      },
      {
        status: 500,
      },
    );
  }
}