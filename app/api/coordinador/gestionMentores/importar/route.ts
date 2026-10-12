
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

export const runtime = "nodejs";

const MAX_POR_LOTE = 5;
const MAX_INTENTOS_GRAPH = 3;

type MentorEntrada = {
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  especialidad: string;
  resumen: string;
};

type Resultado = {
  nombres: string;
  apellidos: string;
  email: string;

  estado: "creado" | "omitido" | "error";
  mensaje: string;

  invitacionEnviada?: boolean;
};

type StaffMember = {
  id: string;
  displayName?: string;
  emailAddress?: string;
};

type StaffPage = {
  value?: StaffMember[];
  "@odata.nextLink"?: string;
};

function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

function campo(valor: unknown): string {
  return typeof valor === "string"
    ? valor.trim()
    : "";
}

/* =====================================================
   AUTORIZACIÓN DEL COORDINADOR
===================================================== */

async function autorizar(request: NextRequest) {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authorization.slice(7);

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const {
    data: profile,
    error: profileError,
  } = await supabaseAdmin
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("UNAUTHORIZED");
  }

  if (
    profile.rol !== "coordinador" ||
    profile.activo !== true
  ) {
    throw new Error("FORBIDDEN");
  }
}

/* =====================================================
   ERRORES Y REINTENTOS MICROSOFT GRAPH
===================================================== */

function limitarMicrosoft(error: unknown): boolean {
  const mensaje = (
    error instanceof Error
      ? error.message
      : String(error)
  ).toLowerCase();

  return (
    mensaje.includes("too many requests") ||
    mensaje.includes("429") ||
    mensaje.includes("throttl")
  );
}

async function reintentarGraph<T>(
  operacion: () => Promise<T>,
): Promise<T> {
  for (
    let intento = 1;
    intento <= MAX_INTENTOS_GRAPH;
    intento++
  ) {
    try {
      return await operacion();
    } catch (error) {
      if (
        !limitarMicrosoft(error) ||
        intento === MAX_INTENTOS_GRAPH
      ) {
        throw error;
      }

      await new Promise<void>((resolve) =>
        setTimeout(resolve, 1500 * intento),
      );
    }
  }

  throw new Error(
    "No se pudo completar la solicitud a Microsoft Bookings.",
  );
}

/* =====================================================
   CONSULTAR TODOS LOS STAFF DE BOOKINGS
   INCLUYENDO PAGINACIÓN
===================================================== */

async function consultarStaffExistente(
  businessId: string,
): Promise<Set<string>> {
  const correos = new Set<string>();

  let ruta: string | null =
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId,
    )}/staffMembers`;

  const visitadas = new Set<string>();

  while (ruta) {
    if (
      visitadas.has(ruta) ||
      visitadas.size >= 100
    ) {
      throw new Error(
        "No se pudo completar la consulta de personal de Bookings.",
      );
    }

    visitadas.add(ruta);

    const rutaActual = ruta;

    const pagina: StaffPage =
      await reintentarGraph(() =>
        graphRequest<StaffPage>(rutaActual),
      );

    for (const staff of pagina.value ?? []) {
      const correo = normalizarEmail(
        staff.emailAddress ?? "",
      );

      if (correo) {
        correos.add(correo);
      }
    }

    const siguiente =
      pagina["@odata.nextLink"];

    if (!siguiente) {
      ruta = null;
    } else if (
      siguiente.startsWith(
        "https://graph.microsoft.com/v1.0/",
      )
    ) {
      ruta = siguiente.replace(
        "https://graph.microsoft.com/v1.0",
        "",
      );
    } else if (
      siguiente.startsWith("/solutions/")
    ) {
      ruta = siguiente;
    } else {
      throw new Error(
        "Microsoft devolvió una paginación no reconocida.",
      );
    }
  }

  return correos;
}

/* =====================================================
   CREAR MENTOR INDIVIDUAL DENTRO DEL LOTE
===================================================== */

async function crearMentor(
  mentor: MentorEntrada,
  businessId: string,
  existentes: Set<string>,
  redirectTo: string,
): Promise<Resultado> {
  const {
    nombres,
    apellidos,
    email,
  } = mentor;

  const base = {
    nombres,
    apellidos,
    email,
  };

  /* =========================================
     1. COMPROBAR BOOKING EXISTENTE
  ========================================= */

  if (existentes.has(email)) {
    return {
      ...base,
      estado: "omitido",
      mensaje:
        "Ya existe como personal de Microsoft Bookings.",
    };
  }

  let userId: string | null = null;
  let staffId: string | null = null;

  let reversionsFallidas = false;

  // Solo se revierten registros si falla
  // la creación o vinculación del mentor.
  // Un error de correo no provoca rollback.

  try {
    /* =========================================
       2. COMPROBAR SUPABASE PROFILES
    ========================================= */

    const {
      data: profiles,
      error: consultaError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (consultaError) {
      throw consultaError;
    }

    if ((profiles ?? []).length > 0) {
      return {
        ...base,
        estado: "omitido",
        mensaje:
          "Ya existe un perfil con ese correo en Supabase.",
      };
    }

    /* =========================================
       3. CREAR USUARIO SIN CONTRASEÑA
    ========================================= */

    const {
      data: authData,
      error: authError,
    } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          nombres,
          apellidos,
        },
      });

    if (authError) {
      if (
        /already|registered|exists|duplicate/i.test(
          authError.message,
        )
      ) {
        return {
          ...base,
          estado: "omitido",
          mensaje:
            "El correo ya existe en Supabase Authentication.",
        };
      }

      throw authError;
    }

    if (!authData.user) {
      throw new Error(
        "Supabase no devolvió el usuario creado.",
      );
    }

    userId = authData.user.id;

    /* =========================================
       4. ACTUALIZAR PROFILE COMO MENTOR
    ========================================= */

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .update({
        nombres,
        apellidos: apellidos || null,
        email,
        telefono: mentor.telefono || null,
        especialidad:
          mentor.especialidad || null,
        resumen: mentor.resumen || null,

        rol: "mentor",
        activo: true,

        // Cuenta pendiente de activación.
        cuenta_activada: false,

        microsoft_staff_id: null,
        microsoft_email: email,
      })
      .eq("id", userId)
      .select("id")
      .single();

    if (profileError || !profile) {
      throw new Error(
        "No se pudo actualizar el perfil del mentor.",
      );
    }

    /* =========================================
       5. CREAR STAFF EN MICROSOFT BOOKINGS
    ========================================= */

    const staff = await graphRequest<StaffMember>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers`,
      {
        method: "POST",
        body: JSON.stringify({
          "@odata.type":
            "#microsoft.graph.bookingStaffMember",

          displayName: [
            nombres,
            apellidos,
          ]
            .filter(Boolean)
            .join(" "),

          emailAddress: email,

          role: "externalGuest",

          timeZone:
            "SA Pacific Standard Time",

          useBusinessHours: true,
        }),
      },
    );

    if (!staff.id) {
      throw new Error(
        "Microsoft Bookings no devolvió el staffId.",
      );
    }

    staffId = staff.id;

    /* =========================================
       6. VINCULAR SUPABASE Y BOOKINGS
    ========================================= */

    const {
      data: vinculado,
      error: linkError,
    } = await supabaseAdmin
      .from("profiles")
      .update({
        microsoft_staff_id: staffId,
        microsoft_email: email,
      })
      .eq("id", userId)
      .select("id")
      .single();

    if (linkError || !vinculado) {
      throw new Error(
        "No se pudo vincular el mentor con Microsoft Bookings.",
      );
    }

    // La creación ya está completa.
    // Registramos el correo para evitar
    // duplicados en el mismo lote.
    existentes.add(email);

    /* =========================================
       7. SOLICITAR CORREO DE ACTIVACIÓN
    ========================================= */

    let invitacionEnviada = false;

    try {
      const { error: emailError } =
        await supabaseAdmin.auth.resetPasswordForEmail(
          email,
          {
            redirectTo,
          },
        );

      if (emailError) {
        throw emailError;
      }

      invitacionEnviada = true;

      console.info(
        "[importar-mentores] Correo solicitado:",
        email,
      );
    } catch (emailError) {
      // El mentor sigue creado y vinculado.
      // No eliminamos su cuenta por fallos
      // de correo o límites del SMTP.

      console.error(
        "[importar-mentores] Correo pendiente:",
        {
          email,
          error: emailError,
        },
      );
    }

    /* =========================================
       8. RESULTADO INDIVIDUAL
    ========================================= */

    return {
      ...base,

      estado: "creado",

      invitacionEnviada,

      mensaje: invitacionEnviada
        ? "Mentor creado. Se solicitó el envío del correo de activación."
        : "Mentor creado correctamente, pero el correo de activación quedó pendiente de envío.",
    };
  } catch (error) {
    /* =========================================
       9. ROLLBACK BOOKINGS
    ========================================= */

    if (staffId) {
      const staffIdRollback = staffId;

      try {
        await reintentarGraph(() =>
          graphRequest(
            `/solutions/bookingBusinesses/${encodeURIComponent(
              businessId,
            )}/staffMembers/${encodeURIComponent(
              staffIdRollback,
            )}`,
            {
              method: "DELETE",
            },
          ),
        );
      } catch (rollbackError) {
        reversionsFallidas = true;

        console.error(
          "[importar-mentores] Falló rollback Bookings:",
          rollbackError,
        );
      }
    }

    /* =========================================
       10. ROLLBACK SUPABASE
    ========================================= */

    if (userId) {
      try {
        const { error: deleteError } =
          await supabaseAdmin.auth.admin.deleteUser(
            userId,
          );

        if (deleteError) {
          throw deleteError;
        }
      } catch (rollbackError) {
        reversionsFallidas = true;

        console.error(
          "[importar-mentores] Falló rollback Supabase:",
          rollbackError,
        );
      }
    }

    console.error(
      "[importar-mentores] Error creando:",
      email,
      error,
    );

    return {
      ...base,

      estado: "error",

      mensaje: reversionsFallidas
        ? "Error con reversión incompleta. Revisa Supabase y Microsoft Bookings antes de reintentar."
        : error instanceof Error
          ? error.message
          : "No se pudo crear el mentor.",
    };
  }
}

/* =====================================================
   POST
   IMPORTAR LOTE DE MENTORES
===================================================== */

export async function POST(request: NextRequest) {
  try {
    /* =========================================
       1. AUTORIZAR
    ========================================= */

    await autorizar(request);

    /* =========================================
       2. VALIDAR CONFIGURACIÓN
    ========================================= */

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "");

    if (!appUrl) {
      return NextResponse.json(
        {
          error:
            "Falta configurar NEXT_PUBLIC_APP_URL para enviar enlaces de activación.",
        },
        { status: 500 },
      );
    }

    const redirectTo = new URL(
      "/auth/activar-cuenta",
      appUrl,
    ).toString();

    /* =========================================
       3. LEER ARCHIVO PROCESADO POR FRONTEND
    ========================================= */

    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      !("mentores" in body) ||
      !Array.isArray(body.mentores)
    ) {
      return NextResponse.json(
        {
          error:
            "Debes enviar una lista de mentores.",
        },
        { status: 400 },
      );
    }

    const entradas: unknown[] =
      body.mentores;

    if (
      entradas.length === 0 ||
      entradas.length > MAX_POR_LOTE
    ) {
      return NextResponse.json(
        {
          error:
            `Solo se admiten entre 1 y ${MAX_POR_LOTE} mentores por lote.`,
        },
        { status: 400 },
      );
    }

    /* =========================================
       4. VALIDAR LOS REGISTROS
    ========================================= */

    const revisados: MentorEntrada[] = [];

    const correosLote = new Set<string>();

    for (const item of entradas) {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        return NextResponse.json(
          {
            error:
              "Registro con formato incorrecto.",
          },
          { status: 400 },
        );
      }

      const fila =
        item as Record<string, unknown>;

      const mentor: MentorEntrada = {
        nombres: campo(fila.nombres),
        apellidos: campo(fila.apellidos),

        email: normalizarEmail(
          campo(fila.email),
        ),

        telefono: campo(fila.telefono),

        especialidad: campo(
          fila.especialidad,
        ),

        resumen: campo(fila.resumen),
      };

      if (
        !mentor.nombres ||
        mentor.nombres.length > 150 ||
        !mentor.email ||
        mentor.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          mentor.email,
        )
      ) {
        return NextResponse.json(
          {
            error:
              `Nombres o correo inválidos: ${mentor.email || "(sin correo)"}.`,
          },
          { status: 400 },
        );
      }

      if (correosLote.has(mentor.email)) {
        return NextResponse.json(
          {
            error:
              `Correo duplicado en el lote: ${mentor.email}`,
          },
          { status: 400 },
        );
      }

      correosLote.add(mentor.email);

      revisados.push(mentor);
    }

    /* =========================================
       5. CONSULTAR MICROSOFT BOOKINGS
    ========================================= */

    const businessId =
      getBookingBusinessId();

    const existentes =
      await consultarStaffExistente(
        businessId,
      );

    /* =========================================
       6. PROCESAR CADA MENTOR
    ========================================= */

    const resultados: Resultado[] = [];

    for (const mentor of revisados) {
      const resultado = await crearMentor(
        mentor,
        businessId,
        existentes,
        redirectTo,
      );

      resultados.push(resultado);
    }

    /* =========================================
       7. RESPUESTA GENERAL
    ========================================= */

    return NextResponse.json({
      resultados,

      total: resultados.length,

      creados: resultados.filter(
        (r) => r.estado === "creado",
      ).length,

      omitidos: resultados.filter(
        (r) => r.estado === "omitido",
      ).length,

      errores: resultados.filter(
        (r) => r.estado === "error",
      ).length,

      invitacionesEnviadas:
        resultados.filter(
          (r) =>
            r.estado === "creado" &&
            r.invitacionEnviada === true,
        ).length,

      invitacionesPendientes:
        resultados.filter(
          (r) =>
            r.estado === "creado" &&
            r.invitacionEnviada === false,
        ).length,
    });
  } catch (error) {
    const mensaje =
      error instanceof Error
        ? error.message
        : "Error interno";

    if (mensaje === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          error: "No autenticado.",
        },
        { status: 401 },
      );
    }

    if (mensaje === "FORBIDDEN") {
      return NextResponse.json(
        {
          error: "No autorizado.",
        },
        { status: 403 },
      );
    }

    console.error(
      "[importar-mentores] Error general:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudo procesar el lote. Verifica Supabase y Microsoft Bookings antes de reintentar.",
      },
      { status: 500 },
    );
  }
}
