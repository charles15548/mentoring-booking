import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";

function getDatabase(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

async function getMentee(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const db = getDatabase(authorization.slice(7).trim());
  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();
  if (userError || !user) throw new Error("UNAUTHORIZED");
  const { data: profile, error } = await db
    .from("profiles")
    .select("id, email, rol, activo")
    .eq("id", user.id)
    .single();
  if (error || !profile) throw new Error("UNAUTHORIZED");
  if (profile.rol !== "mentee" || !profile.activo) throw new Error("FORBIDDEN");
  return { db, profile };
}

async function assertMenteeBooking(email: string, bookingId: string) {
  const businessId = getBookingBusinessId();
  const appointment = await graphRequest<{
    customers?: Array<{ emailAddress?: string }>;
  }>(
    `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}/appointments/${encodeURIComponent(bookingId)}`,
  );
  const belongsToMentee = appointment.customers?.some(
    (customer) =>
      customer.emailAddress?.trim().toLowerCase() ===
      email.trim().toLowerCase(),
  );
  if (!belongsToMentee) throw new Error("FORBIDDEN");
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Error interno.";
  const status =
    message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
  return NextResponse.json(
    {
      error:
        message === "UNAUTHORIZED"
          ? "No autenticado."
          : message === "FORBIDDEN"
            ? "No tienes permiso para ver los acuerdos de esta mentoría."
            : message,
    },
    { status },
  );
}

export async function GET(request: Request) {
  try {
    const rawBookingId =
      new URL(request.url).searchParams.get("bookingId") ?? "";
    const bookingId = decodeURIComponent(rawBookingId);
    if (!bookingId)
      return NextResponse.json(
        { error: "bookingId es obligatorio." },
        { status: 400 },
      );
    const { db, profile } = await getMentee(request);
    await assertMenteeBooking(profile.email, bookingId);
    const { data, error } = await db
      .from("acuerdos")
      .select(
        "id, titulo, descripcion, observacion, estado, fecha_limite, cumplido_at, created_at, updated_at",
      )
      .eq("microsoft_booking_id", bookingId)
      .eq("responsable_id", profile.id)
      .order("created_at");
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const allowedStates = ["pendiente", "en_progreso", "cumplido", "cancelado"];
    if (typeof body.id !== "string" || !allowedStates.includes(body.estado))
      return NextResponse.json(
        { error: "El acuerdo o estado no es válido." },
        { status: 400 },
      );
    const { db, profile } = await getMentee(request);
    const { data: agreement, error: findError } = await db
      .from("acuerdos")
      .select("microsoft_booking_id")
      .eq("id", body.id)
      .eq("responsable_id", profile.id)
      .single();
    if (findError || !agreement)
      return NextResponse.json(
        { error: "Acuerdo no encontrado." },
        { status: 404 },
      );
    await assertMenteeBooking(profile.email, agreement.microsoft_booking_id);
    const { data, error } = await db
      .from("acuerdos")
      .update({
        estado: body.estado,
        cumplido_at:
          body.estado === "cumplido" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id)
      .eq("responsable_id", profile.id)
      .select(
        "id, titulo, descripcion, observacion, estado, fecha_limite, cumplido_at, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
