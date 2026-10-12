
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

async function obtenerUsuario(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.substring(7);

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

// Consultar si la cuenta ya fue activada
export async function GET(request: NextRequest) {
  try {
    const user = await obtenerUsuario(request);

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 }
      );
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("cuenta_activada")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { error: "No se encontró el perfil del usuario." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      cuenta_activada: profile.cuenta_activada,
    });
  } catch (error) {
    console.error("[estado-activacion:GET]", error);

    return NextResponse.json(
      { error: "No se pudo consultar la activación." },
      { status: 500 }
    );
  }
}

// Registrar activación del usuario autenticado
export async function POST(request: NextRequest) {
  try {
    const user = await obtenerUsuario(request);

    if (!user) {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("id, rol, cuenta_activada")
        .eq("id", user.id)
        .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "No se encontró el perfil del usuario." },
        { status: 404 }
      );
    }

    if (profile.rol !== "mentor" && profile.rol !== "mentee") {
      return NextResponse.json(
        { error: "El rol no admite esta operación." },
        { status: 403 }
      );
    }

    if (profile.cuenta_activada === true) {
      return NextResponse.json({
        cuenta_activada: true,
        message: "La cuenta ya estaba activada.",
      });
    }

    const { data: actualizado, error: updateError } =
      await supabaseAdmin
        .from("profiles")
        .update({
          cuenta_activada: true,
        })
        .eq("id", user.id)
        .eq("cuenta_activada", false)
        .select("id, cuenta_activada")
        .single();

    if (updateError || !actualizado) {
      return NextResponse.json(
        { error: "No se pudo registrar la activación." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      cuenta_activada: true,
      message: "Cuenta activada correctamente.",
    });
  } catch (error) {
    console.error("[estado-activacion:POST]", error);

    return NextResponse.json(
      { error: "No se pudo completar la activación." },
      { status: 500 }
    );
  }
}
