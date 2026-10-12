
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    /* ==============================================
       1. VALIDAR SESIÓN
    ============================================== */

    const authorization = request.headers.get("authorization");

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
        { error: "La sesión no es válida o ha expirado." },
        { status: 401 },
      );
    }

    /* ==============================================
       2. CONSULTAR PERFIL
    ============================================== */

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, rol, debe_cambiar_password")
        .eq("id", user.id)
        .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "No se encontró el perfil del usuario." },
        { status: 404 },
      );
    }

    if (
      profile.rol !== "mentor" &&
      profile.rol !== "mentee"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta operación está disponible para mentores y mentees.",
        },
        { status: 403 },
      );
    }

    if (profile.debe_cambiar_password !== true) {
      return NextResponse.json(
        {
          error:
            "Esta cuenta no tiene un cambio inicial pendiente.",
        },
        { status: 409 },
      );
    }

    /* ==============================================
       3. VALIDAR NUEVA CONTRASEÑA
    ============================================== */

    const body = await request.json();

    const newPassword = body.newPassword;

    if (typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "Ingresa una contraseña válida." },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        {
          error:
            "La contraseña debe tener al menos 8 caracteres.",
        },
        { status: 400 },
      );
    }

    if (newPassword.length > 128) {
      return NextResponse.json(
        {
          error:
            "La contraseña no puede superar los 128 caracteres.",
        },
        { status: 400 },
      );
    }

    /* ==============================================
       4. ACTUALIZAR SUPABASE AUTH
    ============================================== */

    const { error: updatePasswordError } =
      await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          password: newPassword,
        },
      );

    if (updatePasswordError) {
      console.error(
        "[password-inicial] Error al actualizar Auth:",
        updatePasswordError.message,
      );

      return NextResponse.json(
        {
          error:
            "No se pudo actualizar la contraseña. Inténtalo nuevamente.",
        },
        { status: 500 },
      );
    }

    /* ==============================================
       5. MARCAR CAMBIO COMO COMPLETADO
    ============================================== */

    const { data: updatedProfile, error: updateError } =
      await supabaseAdmin
        .from("profiles")
        .update({
          debe_cambiar_password: false,
        })
        .eq("id", user.id)
        .eq("debe_cambiar_password", true)
        .select("id")
        .maybeSingle();

    if (updateError || !updatedProfile) {
      console.error(
        "[password-inicial] No se pudo actualizar profiles:",
        updateError?.message,
      );

      return NextResponse.json(
        {
          error:
            "La contraseña fue actualizada, pero no se pudo completar la activación del perfil. Contacta al administrador antes de continuar.",
        },
        { status: 500 },
      );
    }

    /* ==============================================
       6. RESPUESTA
    ============================================== */

    return NextResponse.json({
      message: "Tu contraseña se actualizó correctamente.",
      debe_cambiar_password: false,
    });
  } catch (error) {
    console.error("[password-inicial] Error:", error);

    return NextResponse.json(
      {
        error: "No se pudo procesar el cambio de contraseña.",
      },
      { status: 500 },
    );
  }
}
