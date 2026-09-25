import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireCoordinator, handleError } from "../gestionMentores/route";

/* =========================================================
   GET
   LISTAR ASIGNACIONES
========================================================= */

export async function GET(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const { data: assignments, error } =
      await supabaseAdmin
        .from("mentor_assignments")
        .select("mentor_id, mentee_id");

    if (error) throw error;

    if (!assignments?.length) {
      return NextResponse.json([]);
    }

    const ids = [
      ...new Set(
        assignments.flatMap((item) => [
          item.mentor_id,
          item.mentee_id,
        ]),
      ),
    ];

    const { data: profiles, error: profilesError } =
      await supabaseAdmin
        .from("profiles")
        .select(`
          id,
          nombres,
          apellidos,
          email,
          especialidad,
          foto_url,
          rol
        `)
        .in("id", ids);

    if (profilesError) throw profilesError;

    const profileMap = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        profile,
      ]),
    );

    const grouped = new Map<
      string,
      {
        mentor: any;
        mentees: any[];
      }
    >();

    for (const assignment of assignments) {
      const mentor =
        profileMap.get(assignment.mentor_id);

      const mentee =
        profileMap.get(assignment.mentee_id);

      if (!mentor || !mentee) continue;

      if (!grouped.has(assignment.mentor_id)) {
        grouped.set(assignment.mentor_id, {
          mentor,
          mentees: [],
        });
      }

      grouped
        .get(assignment.mentor_id)!
        .mentees.push(mentee);
    }

    return NextResponse.json(
      Array.from(grouped.values()),
    );
  } catch (error) {
    return handleError(error);
  }
}
/* =========================================================
   POST
   CREAR ASIGNACIONES
========================================================= */

export async function POST(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const { menteeIds, mentorIds } = await request.json();

    const assignments = menteeIds.flatMap((menteeId: string) =>
      mentorIds.map((mentorId: string) => ({
        mentee_id: menteeId,
        mentor_id: mentorId,
      })),
    );

    const { data, error } = await supabaseAdmin
      .from("mentor_assignments")
      .upsert(assignments, {
        onConflict: "mentor_id,mentee_id",
        ignoreDuplicates: true,
      })
      .select();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return handleError(error);
  }
}

/* =========================================================
   PUT
   CAMBIAR MENTORES ASIGNADOS A UN MENTEE
========================================================= */

export async function PUT(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const {
      mentorId,
      menteeIds,
    } = await request.json();

    await supabaseAdmin
      .from("mentor_assignments")
      .delete()
      .eq("mentor_id", mentorId);

    if (menteeIds.length) {
      const assignments = menteeIds.map(
        (menteeId: string) => ({
          mentor_id: mentorId,
          mentee_id: menteeId,
        }),
      );

      const { error } = await supabaseAdmin
        .from("mentor_assignments")
        .insert(assignments);

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return handleError(error);
  }
}
/* =========================================================
   DELETE
   ELIMINAR ASIGNACIÓN
========================================================= */

export async function DELETE(request: NextRequest) {
  try {
    await requireCoordinator(request);
    const url = new URL(request.url);
    const menteeId = url.searchParams.get("menteeId");
    const mentorId = url.searchParams.get("mentorId");

    let query = supabaseAdmin
    .from("mentor_assignments")
    .delete()
    .eq("mentee_id",menteeId);

    if(mentorId){
        query = query.eq("mentor_id",mentorId);
    }

    const {error} = await query;
    if(error) throw error;
    return NextResponse.json({
        success: true
    });

  } catch (error) {
    return handleError(error);
  }
}
