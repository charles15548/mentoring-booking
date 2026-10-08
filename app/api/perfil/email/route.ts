import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Profile = {
  id: string;
  email: string;
};

export async function PATCH(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const accessToken = authorization.slice(7);

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Sesión inválida o expirada." },
        { status: 401 },
      );
    }

    const body = await request.json();

    const newEmail =
      typeof body.newEmail === "string"
        ? body.newEmail.trim().toLowerCase()
        : "";

    if (!newEmail) {
      return NextResponse.json(
        { error: "Ingresa un correo electrónico." },
        { status: 400 },
      );
    }

    if (newEmail === user.email?.toLowerCase()) {
      return NextResponse.json(
        { error: "El nuevo correo debe ser diferente al actual." },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { error: "Ingresa un correo electrónico válido." },
        { status: 400 },
      );
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", newEmail)
      .maybeSingle<Profile>();

    if (existingProfile && existingProfile.id !== user.id) {
      return NextResponse.json(
        { error: "Ese correo ya está registrado en otra cuenta." },
        { status: 409 },
      );
    }

    const oldEmail = user.email;

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        email: newEmail,
        email_confirm: true,
      },
    );

    if (authError) {
      console.error("Error actualizando correo en Auth:", authError.message);

      return NextResponse.json(
        {
          error:
            authError.message ||
            "No se pudo actualizar el correo de la cuenta.",
        },
        { status: 500 },
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        email: newEmail,
      })
      .eq("id", user.id);

    if (profileError) {
      console.error(
        "Error actualizando correo en profiles:",
        profileError.message,
      );

      if (oldEmail) {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          email: oldEmail,
          email_confirm: true,
        });
      }

      return NextResponse.json(
        {
          error: "No se pudo sincronizar el correo del perfil.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      email: newEmail,
    });
  } catch (error) {
    console.error("Error en cambio de correo:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cambiar el correo.",
      },
      { status: 500 },
    );
  }
}
