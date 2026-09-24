import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "bucket";
const FIELDS = "id, nombres, apellidos, email, telefono, especialidad, foto_url, resumen, rol";

type Profile = {
  id: string;
  nombres: string;
  apellidos: string | null;
  email: string;
  telefono: string | null;
  especialidad: string | null;
  foto_url: string | null;
  resumen: string | null;
  rol: "mentee" | "mentor" | "coordinador";
};

async function currentProfile(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
    authorization.slice(7),
  );
  if (userError || !user) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(FIELDS)
    .eq("id", user.id)
    .single<Profile>();

  return error ? null : data;
}

function storagePath(url: string | null) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

async function deleteStorageObject(path: string | null) {
  if (!path) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) console.error("No se pudo borrar la foto anterior:", error.message);
}

function formText(form: FormData, field: string, max: number) {
  const item = form.get(field);
  if (typeof item !== "string") return undefined;
  const text = item.trim();
  if (text.length > max) throw new Error(`${field} supera el máximo permitido.`);
  return text || null;
}

export async function GET(request: NextRequest) {
  const profile = await currentProfile(request);
  if (!profile) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  return NextResponse.json({ profile });
}

export async function PATCH(request: NextRequest) {
  try {
    const profile = await currentProfile(request);
    if (!profile) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const form = await request.formData();
    const update: Partial<Profile> = {};
    const nombres = formText(form, "nombres", 120);
    const apellidos = formText(form, "apellidos", 120);
    const telefono = formText(form, "telefono", 30);
    const especialidad = formText(form, "especialidad", 160);
    const resumen = formText(form, "resumen", 1200);

    if (nombres !== undefined) {
      if (!nombres) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
      update.nombres = nombres;
    }
    if (apellidos !== undefined) update.apellidos = apellidos;
    if (telefono !== undefined) update.telefono = telefono;
    if (especialidad !== undefined) update.especialidad = especialidad;
    if (resumen !== undefined) update.resumen = resumen;

    const photo = form.get("foto");
    const removePhoto = form.get("remove_photo") === "true";
    let newPath: string | null = null;

    if (photo instanceof File && photo.size > 0) {
      if (!photo.type.startsWith("image/")) return NextResponse.json({ error: "Selecciona una imagen válida." }, { status: 400 });
      if (photo.size > 5 * 1024 * 1024) return NextResponse.json({ error: "La foto no puede superar los 5 MB." }, { status: 400 });

      const extension = photo.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      newPath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(newPath, photo, { contentType: photo.type });
      if (uploadError) return NextResponse.json({ error: `No se pudo subir la foto: ${uploadError.message}` }, { status: 500 });
      update.foto_url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl;
    } else if (removePhoto) {
      update.foto_url = null;
    }

    if (!Object.keys(update).length) return NextResponse.json({ error: "No hay cambios para guardar." }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", profile.id)
      .select(FIELDS)
      .single<Profile>();

    if (error || !data) {
      await deleteStorageObject(newPath);
      return NextResponse.json({ error: "No se pudo actualizar el perfil." }, { status: 500 });
    }

    if (newPath || removePhoto) await deleteStorageObject(storagePath(profile.foto_url));
    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error interno." }, { status: 400 });
  }
}
