import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const BUCKET_NAME = "bucket";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function getDatabase(token: string) {
return createClient(supabaseUrl, supabaseAnonKey, {
global: {
headers: {
Authorization: `Bearer ${token}`,
},
},
});
}

async function getMentee(request: NextRequest) {
const authorization = request.headers.get("authorization");

if (!authorization?.startsWith("Bearer ")) {
throw new Error("NO_AUTH");
}

const token = authorization.replace("Bearer ", "").trim();

const db = getDatabase(token);

const {
data: { user },
error: userError,
} = await db.auth.getUser();

if (userError || !user) {
throw new Error("UNAUTHORIZED");
}

const { data: profile, error: profileError } = await db
.from("profiles")
.select("id, email, rol, activo")
.eq("id", user.id)
.single();

if (
profileError ||
!profile ||
profile.rol !== "mentee" ||
profile.activo !== true
) {
throw new Error("FORBIDDEN");
}

return profile;
}

async function verificarAcuerdo(
acuerdoId: string,
menteeId: string,
) {
const { data: acuerdo, error } = await supabaseAdmin
.from("acuerdos")
.select("id, responsable_id")
.eq("id", acuerdoId)
.eq("responsable_id", menteeId)
.single();

if (error || !acuerdo) {
return null;
}

return acuerdo;
}

export async function GET(request: NextRequest) {
try {
const mentee = await getMentee(request);


const acuerdoId =
  request.nextUrl.searchParams.get("acuerdoId");

if (!acuerdoId) {
  return NextResponse.json(
    { error: "Falta el acuerdoId." },
    { status: 400 },
  );
}

const acuerdo = await verificarAcuerdo(
  acuerdoId,
  mentee.id,
);

if (!acuerdo) {
  return NextResponse.json(
    { error: "No tienes acceso a este acuerdo." },
    { status: 403 },
  );
}

const { data: evidencias, error: evidenciasError } =
  await supabaseAdmin
    .from("evidencias")
    .select(
      "id, acuerdo_id, nombre_archivo, ruta_archivo, tipo_archivo, tamano, created_at",
    )
    .eq("acuerdo_id", acuerdoId)
    .order("created_at", { ascending: false });

if (evidenciasError) {
  console.error(
    "Error obteniendo evidencias:",
    evidenciasError,
  );

  return NextResponse.json(
    { error: "No se pudieron obtener las evidencias." },
    { status: 500 },
  );
}

return NextResponse.json(evidencias ?? []);


} catch (error) {
console.error(
"Error en GET /api/mentee/evidencias:",
error,
);


if (error instanceof Error) {
  if (error.message === "NO_AUTH") {
    return NextResponse.json(
      { error: "No hay sesión activa." },
      { status: 401 },
    );
  }

  if (error.message === "UNAUTHORIZED") {
    return NextResponse.json(
      { error: "Sesión no válida." },
      { status: 401 },
    );
  }

  if (error.message === "FORBIDDEN") {
    return NextResponse.json(
      { error: "No tienes permisos." },
      { status: 403 },
    );
  }
}

return NextResponse.json(
  { error: "Error interno del servidor." },
  { status: 500 },
);


}
}

export async function POST(request: NextRequest) {
try {
const mentee = await getMentee(request);


const formData = await request.formData();

const acuerdoId = formData.get("acuerdoId");
const file = formData.get("file");

if (typeof acuerdoId !== "string" || !acuerdoId) {
  return NextResponse.json(
    { error: "Falta el acuerdoId." },
    { status: 400 },
  );
}

if (!(file instanceof File)) {
  return NextResponse.json(
    { error: "No se recibió ningún archivo." },
    { status: 400 },
  );
}

if (file.size === 0) {
  return NextResponse.json(
    { error: "El archivo está vacío." },
    { status: 400 },
  );
}

if (file.size > MAX_FILE_SIZE) {
  return NextResponse.json(
    { error: "El archivo supera el límite de 50 MB." },
    { status: 400 },
  );
}

const acuerdo = await verificarAcuerdo(
  acuerdoId,
  mentee.id,
);

if (!acuerdo) {
  return NextResponse.json(
    { error: "No tienes acceso a este acuerdo." },
    { status: 403 },
  );
}

const nombreSeguro = file.name.replace(
  /[^a-zA-Z0-9._-]/g,
  "_",
);

const ruta = `${acuerdoId}/${Date.now()}-${nombreSeguro}`;

const archivo = Buffer.from(
  await file.arrayBuffer(),
);

const { error: uploadError } =
  await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(ruta, archivo, {
      contentType:
        file.type || "application/octet-stream",
      upsert: false,
    });

if (uploadError) {
  console.error(
    "Error subiendo archivo:",
    uploadError,
  );

  return NextResponse.json(
    { error: "No se pudo subir el archivo." },
    { status: 500 },
  );
}

const {
  data: evidencia,
  error: evidenciaError,
} = await supabaseAdmin
  .from("evidencias")
  .insert({
    acuerdo_id: acuerdoId,
    nombre_archivo: file.name,
    ruta_archivo: ruta,
    tipo_archivo: file.type || null,
    tamano: file.size,
  })
  .select(
    "id, acuerdo_id, nombre_archivo, ruta_archivo, tipo_archivo, tamano, created_at",
  )
  .single();

if (evidenciaError) {
  console.error(
    "Error registrando evidencia:",
    evidenciaError,
  );

  await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([ruta]);

  return NextResponse.json(
    { error: "No se pudo registrar la evidencia." },
    { status: 500 },
  );
}

return NextResponse.json(
  evidencia,
  { status: 201 },
);


} catch (error) {
console.error(
"Error en POST /api/mentee/evidencias:",
error,
);


if (error instanceof Error) {
  if (error.message === "NO_AUTH") {
    return NextResponse.json(
      { error: "No hay sesión activa." },
      { status: 401 },
    );
  }

  if (error.message === "UNAUTHORIZED") {
    return NextResponse.json(
      { error: "Sesión no válida." },
      { status: 401 },
    );
  }

  if (error.message === "FORBIDDEN") {
    return NextResponse.json(
      { error: "No tienes permisos." },
      { status: 403 },
    );
  }
}

return NextResponse.json(
  { error: "Error interno del servidor." },
  { status: 500 },
);


}
}
