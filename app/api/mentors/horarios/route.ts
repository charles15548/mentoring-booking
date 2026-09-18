// app/api/mentors/horarios/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  graphRequest,
  getBookingBusinessId,
} from "@/lib/microsoft-graph";

type TimeSlot = {
  startTime: string;
  endTime: string;
};

type WorkingDay = {
  day:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  timeSlots: TimeSlot[];
};

interface GraphStaffMember {
  id: string;
  displayName: string;
  emailAddress?: string;
  useBusinessHours?: boolean;
  availabilityIsAffectedByPersonalCalendar?: boolean;
  timeZone?: string;
  workingHours?: WorkingDay[];
}

/* =========================================================
   OBTENER MENTOR LOGUEADO
========================================================= */

async function getCurrentMentor(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authorization.substring(7);

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("profiles")
      .select(`
        id,
        rol,
        activo,
        microsoft_staff_id
      `)
      .eq("id", user.id)
      .single();

  if (profileError || !profile) {
    throw new Error("UNAUTHORIZED");
  }

  if (profile.rol !== "mentor") {
    throw new Error("FORBIDDEN");
  }

  if (!profile.activo) {
    throw new Error("INACTIVE");
  }

  if (!profile.microsoft_staff_id) {
    throw new Error("NO_MICROSOFT_STAFF");
  }

  return profile;
}

function errorResponse(error: unknown) {
  console.error(error);

  const message =
    error instanceof Error ? error.message : "Error interno";

  if (message === "UNAUTHORIZED") {
    return NextResponse.json(
      { error: "No autenticado." },
      { status: 401 },
    );
  }

  if (message === "FORBIDDEN") {
    return NextResponse.json(
      { error: "Solo los mentores pueden administrar horarios." },
      { status: 403 },
    );
  }

  if (message === "INACTIVE") {
    return NextResponse.json(
      { error: "El mentor está inactivo." },
      { status: 403 },
    );
  }

  if (message === "NO_MICROSOFT_STAFF") {
    return NextResponse.json(
      {
        error:
          "El mentor no está vinculado con Microsoft Bookings.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { error: message },
    { status: 500 },
  );
}

/* =========================================================
   GET
   OBTENER HORARIO SEMANAL DEL MENTOR
========================================================= */

export async function GET(request: NextRequest) {
  try {
    const mentor = await getCurrentMentor(request);

    const businessId = getBookingBusinessId();

    const staff =
      await graphRequest<GraphStaffMember>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/staffMembers/${encodeURIComponent(
          mentor.microsoft_staff_id,
        )}`,
      );

    return NextResponse.json({
      id: staff.id,
      name: staff.displayName,

      timeZone:
        staff.timeZone ??
        "SA Pacific Standard Time",

      useBusinessHours:
        staff.useBusinessHours ?? false,

      availabilityIsAffectedByPersonalCalendar:
        staff.availabilityIsAffectedByPersonalCalendar ??
        false,

      workingHours:
        staff.workingHours ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/* =========================================================
   PUT
   ACTUALIZAR HORARIO SEMANAL
========================================================= */

export async function PUT(request: NextRequest) {
  try {
    const mentor = await getCurrentMentor(request);

    const body = await request.json();

    const workingHours = body.workingHours as WorkingDay[];

    if (!Array.isArray(workingHours)) {
      return NextResponse.json(
        {
          error: "workingHours debe ser un arreglo.",
        },
        { status: 400 },
      );
    }

    const validDays = new Set([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);

    /* ================================
       VALIDAR
    ================================= */

    for (const day of workingHours) {
      if (!validDays.has(day.day)) {
        return NextResponse.json(
          {
            error: `Día inválido: ${day.day}`,
          },
          { status: 400 },
        );
      }

      if (!Array.isArray(day.timeSlots)) {
        return NextResponse.json(
          {
            error: `Horarios inválidos para ${day.day}`,
          },
          { status: 400 },
        );
      }

      for (const slot of day.timeSlots) {
        if (!slot.startTime || !slot.endTime) {
          return NextResponse.json(
            {
              error: `Horario incompleto en ${day.day}`,
            },
            { status: 400 },
          );
        }

        if (slot.startTime >= slot.endTime) {
          return NextResponse.json(
            {
              error: `La hora inicial debe ser menor que la final en ${day.day}`,
            },
            { status: 400 },
          );
        }
      }
    }

    const businessId = getBookingBusinessId();

    /* ================================
       FORMATO EXACTO MICROSOFT GRAPH
    ================================= */

    const graphWorkingHours = workingHours.map((day) => ({
      "@odata.type": "#microsoft.graph.bookingWorkHours",

      "day@odata.type":
        "#microsoft.graph.dayOfWeek",

      day: day.day,

      "timeSlots@odata.type":
        "#Collection(microsoft.graph.bookingWorkTimeSlot)",

      timeSlots: day.timeSlots.map((slot) => ({
        "@odata.type":
          "#microsoft.graph.bookingWorkTimeSlot",

        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    }));

    /* ================================
       ACTUALIZAR MICROSOFT
    ================================= */

    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers/${encodeURIComponent(
        mentor.microsoft_staff_id,
      )}`,
      {
        method: "PATCH",

        body: JSON.stringify({
          "@odata.type":
            "#microsoft.graph.bookingStaffMember",

          /*
            MUY IMPORTANTE:
            false = utilizar horario propio del mentor.
          */
          useBusinessHours: false,

          timeZone:
            "SA Pacific Standard Time",

          "workingHours@odata.type":
            "#Collection(microsoft.graph.bookingWorkHours)",

          workingHours: graphWorkingHours,
        }),
      },
    );

    /* ================================
       VOLVER A CONSULTAR MICROSOFT
       PARA CONFIRMAR QUE REALMENTE
       SE GUARDÓ
    ================================= */

    const updatedStaff =
      await graphRequest<GraphStaffMember>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/staffMembers/${encodeURIComponent(
          mentor.microsoft_staff_id,
        )}`,
      );

    console.log(
      "HORARIO GUARDADO EN MICROSOFT:",
      JSON.stringify(
        updatedStaff.workingHours,
        null,
        2,
      ),
    );

    console.log(
      "USE BUSINESS HOURS:",
      updatedStaff.useBusinessHours,
    );

    return NextResponse.json({
      message:
        "Horario actualizado correctamente.",

      workingHours:
        updatedStaff.workingHours ?? [],

      useBusinessHours:
        updatedStaff.useBusinessHours,
    });
  } catch (error) {
    return errorResponse(error);
  }
}