
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // 1. Verificar sesión del coordinador
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 }
      );
    }

    const token = authorization.substring(7);

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Sesión inválida o expirada." },
        { status: 401 }
      );
    }

    // 2. Verificar permisos
    const { data: coordinador, error: coordinadorError } =
      await supabaseAdmin
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
        { error: "No autorizado." },
        { status: 403 }
      );
    }

    // 3. Obtener mentee
    const body = await request.json();
    const profileId = body?.profileId;

    if (
      typeof profileId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        profileId
      )
    ) {
      return NextResponse.json(
        { error: "Identificador de mentee inválido." },
        { status: 400 }
      );
    }

    // 4. Verificar que sea un mentee activo
    const { data: mentee, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, email, nombres, rol, activo")
        .eq("id", profileId)
        .eq("rol", "mentee")
        .single();

    if (profileError || !mentee) {
      return NextResponse.json(
        { error: "No se encontró el perfil del mentee." },
        { status: 404 }
      );
    }

    if (mentee.activo !== true) {
      return NextResponse.json(
        { error: "No se pueden enviar enlaces a cuentas inactivas." },
        { status: 409 }
      );
    }

    // 5. Verificar la cuenta en Supabase Authentication
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(profileId);

    const email = mentee.email?.trim().toLowerCase();

    if (
      authError ||
      !authData.user ||
      !email ||
      authData.user.email?.trim().toLowerCase() !== email
    ) {
      return NextResponse.json(
        {
          error:
            "La cuenta de Authentication no coincide con el perfil. No se envió el correo.",
        },
        { status: 409 }
      );
    }

    // 6. Construir URL de activación
    // En producción configurar NEXT_PUBLIC_APP_URL
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "");

    if (!appUrl) {
      throw new Error(
        "Falta configurar NEXT_PUBLIC_APP_URL para el entorno publicado."
      );
    }

    const redirectTo = new URL(
      "/auth/activar-cuenta",
      appUrl
    ).toString();

    // 7. Solicitar nuevo enlace
    const { error: emailError } =
      await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

    if (emailError) {
      console.error(
        "[reenviar-activacion-mentee] Error SMTP:",
        emailError
      );

      return NextResponse.json(
        {
          error:
            "No se pudo solicitar el envío. Inténtalo nuevamente más tarde.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message:
        "Se solicitó correctamente el envío del nuevo enlace.",
      email,
      enviado: true,
    });
  } catch (error) {
    console.error(
      "[reenviar-activacion-mentee] Error:",
      error
    );

    return NextResponse.json(
      {
        error: "No se pudo procesar el reenvío de activación.",
      },
      { status: 500 }
    );
  }
}
