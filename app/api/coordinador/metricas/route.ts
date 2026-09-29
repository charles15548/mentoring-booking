import { NextRequest, NextResponse } from "next/server";

import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { handleError, requireCoordinator } from "../gestionMentores/route";

type BookingAppointment = {
  id: string;
  startDateTime?: { dateTime?: string; timeZone?: string };
};

const HOUR_LABELS = Array.from({ length: 13 }, (_, index) => index + 8);

function hourInLima(dateTime?: string, timeZone?: string) {
  if (!dateTime) return null;
  if (timeZone === "SA Pacific Standard Time" || timeZone === "America/Lima") {
    const hour = Number(dateTime.slice(11, 13));
    return Number.isInteger(hour) ? hour : null;
  }
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(dateTime) ? dateTime : `${dateTime}Z`);
  if (Number.isNaN(date.getTime())) return null;
  const value = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", hour: "2-digit", hourCycle: "h23" }).format(date));
  return Number.isInteger(value) ? value : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireCoordinator(request);
    const businessId = getBookingBusinessId();
    const [mentees, mentors, bookings] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("rol", "mentee").eq("activo", true),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("rol", "mentor").eq("activo", true),
      graphRequest<{ value?: BookingAppointment[] }>(`/solutions/bookingBusinesses/${encodeURIComponent(businessId)}/appointments?$select=id,startDateTime`),
    ]);
    if (mentees.error) throw mentees.error;
    if (mentors.error) throw mentors.error;
    const appointments = bookings.value ?? [];
    const byHour = new Map(HOUR_LABELS.map((hour) => [hour, 0]));
    for (const appointment of appointments) {
      const hour = hourInLima(appointment.startDateTime?.dateTime, appointment.startDateTime?.timeZone);
      if (hour !== null && byHour.has(hour)) byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
    }
    return NextResponse.json({
      summary: { mentees: mentees.count ?? 0, mentors: mentors.count ?? 0, meetings: appointments.length },
      meetingsByHour: HOUR_LABELS.map((hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, meetings: byHour.get(hour) ?? 0 })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
