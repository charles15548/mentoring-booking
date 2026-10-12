
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // =========================================
    // 1. VERIFICAR SESIÓN
    // =========================================

    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    const token = authorization.slice(7);

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "La sesión no es válida." },
        { status: 401 },
      );
    }

    // =========================================
    // 2. VALIDAR COORDINADOR
    // =========================================

    const {
      data: coordinador,
      error: coordinadorError,
    } = await supabaseAdmin
      .from("profiles")
      .select("rol, activo")
      .eq("id", user.id)
      .single();

    if (
      coordinadorError ||
      !coordinador ||
      coordinador.rol !== "coordinador" ||
      coordinador.activo !== true
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permisos para reenviar enlaces.",
        },
        { status: 403 },
      );
    }

    // =========================================
    // 3. OBTENER MENTOR
    // =========================================

    const body = await request.json();

    const profileId =
      typeof body.profileId === "string"
        ? body.profileId.trim()
        : "";

    const staffId =
      typeof body.staffId === "string"
        ? body.staffId.trim()
        : "";

    if (!profileId || !staffId) {
      return NextResponse.json(
        {
          error:
            "El perfil y el identificador de Bookings son obligatorios.",
        },
        { status: 400 },
      );
    }

    const {
      data: mentor,
      error: mentorError,
    } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, email, rol, activo, microsoft_staff_id",
      )
      .eq("id", profileId)
      .eq("rol", "mentor")
      .eq("microsoft_staff_id", staffId)
      .single();

    if (mentorError || !mentor) {
      return NextResponse.json(
        {
          error:
            "No se encontró un mentor vinculado a la cuenta indicada.",
        },
        { status: 404 },
      );
    }

    if (!mentor.activo) {
      return NextResponse.json(
        {
          error:
            "El mentor está inactivo. Activa su cuenta antes de reenviar el enlace.",
        },
        { status: 409 },
      );
    }

    const email =
      mentor.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        {
          error:
            "El mentor no tiene un correo registrado.",
        },
        { status: 409 },
      );
    }

    // =========================================
    // 4. VALIDAR CUENTA AUTH
    // =========================================

    const {
      data: authData,
      error: userError,
    } =
      await supabaseAdmin.auth.admin.getUserById(
        mentor.id,
      );

    if (
      userError ||
      !authData.user ||
      authData.user.email?.trim().toLowerCase() !==
        email
    ) {
      return NextResponse.json(
        {
          error:
            "La cuenta del mentor no coincide con Supabase Authentication.",
        },
        { status: 409 },
      );
    }

    // =========================================
    // 5. CONFIGURAR REDIRECCIÓN
    // =========================================

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "");

    if (!appUrl) {
      return NextResponse.json(
        {
          error:
            "Falta configurar NEXT_PUBLIC_APP_URL.",
        },
        { status: 500 },
      );
    }

    const redirectTo = new URL(
      "/auth/activar-cuenta",
      appUrl,
    ).toString();

    // =========================================
    // 6. SOLICITAR REENVÍO
    // =========================================

    const { error: emailError } =
      await supabaseAdmin.auth.resetPasswordForEmail(
        email,
        {
          redirectTo,
        },
      );

    if (emailError) {
      console.error(
        "[mentor-reenviar-activacion]",
        {
          profileId,
          error: emailError,
        },
      );

      return NextResponse.json(
        {
          error:
            "No se pudo solicitar el envío del correo. Inténtalo nuevamente más tarde.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      message:
        "Se solicitó el envío del enlace al correo del mentor.",
      email,
    });
  } catch (error) {
    console.error(
      "[mentor-reenviar-activacion] Error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error al procesar el reenvío.",
      },
      { status: 500 },
    );
  }
}
