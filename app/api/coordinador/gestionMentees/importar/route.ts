
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

export const runtime = "nodejs";

const MAX_POR_LOTE = 5;
const MAX_INTENTOS_GRAPH = 3;

type MenteeEntrada = {
  nombres: string;
  apellidos?: string;
  email: string;
  telefono?: string;
  especialidad?: string;
  resumen?: string;
};

type ResultadoImportacion = {
  email: string;
  nombres: string;
  apellidos: string;
  estado: "creado" | "omitido" | "error";
  mensaje: string;
  invitacionEnviada?: boolean;
};

type GraphCustomer = {
  id: string;
  emailAddress?: string;
};

type GraphCustomerPage = {
  value?: GraphCustomer[];
  "@odata.nextLink"?: string;
};

function normalizarEmail(valor: string) {
  return valor.trim().toLowerCase();
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function emailValido(valor: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

async function requireCoordinator(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authorization.substring(7);
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("UNAUTHORIZED");
  }

  if (profile.rol !== "coordinador" || profile.activo !== true) {
    throw new Error("FORBIDDEN");
  }
}

function esperar(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function esLimiteGraph(error: unknown) {
  const mensaje = String(
    error instanceof Error ? error.message : error,
  ).toLowerCase();

  return (
    mensaje.includes("too many requests") ||
    mensaje.includes("429") ||
    mensaje.includes("throttl")
  );
}

async function conReintentosGraph<T>(
  operacion: () => Promise<T>,
): Promise<T> {
  for (let intento = 1; intento <= MAX_INTENTOS_GRAPH; intento++) {
    try {
      return await operacion();
    } catch (error) {
      if (!esLimiteGraph(error) || intento === MAX_INTENTOS_GRAPH) {
        throw error;
      }
      await esperar(1500 * intento);
    }
  }
  throw new Error("No se pudo completar la solicitud de Microsoft.");
}

async function obtenerCorreosBookings(
  businessId: string,
): Promise<Set<string>> {
  const correos = new Set<string>();

  let ruta: string | null =
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId,
    )}/customers`;

  const rutasVisitadas = new Set<string>();

  while (ruta) {
    if (rutasVisitadas.has(ruta) || rutasVisitadas.size >= 100) {
      throw new Error(
        "No se pudo completar la consulta de customers de Bookings.",
      );
    }

    rutasVisitadas.add(ruta);

    const respuesta: GraphCustomerPage = await conReintentosGraph(() =>
      graphRequest<GraphCustomerPage>(ruta!),
    );

    for (const customer of respuesta.value ?? []) {
      const email = normalizarEmail(customer.emailAddress ?? "");
      if (email) correos.add(email);
    }

    const siguiente = respuesta["@odata.nextLink"];

    if (!siguiente) {
      ruta = null;
    } else if (
      siguiente.startsWith("https://graph.microsoft.com/v1.0/")
    ) {
      ruta = siguiente.replace(
        "https://graph.microsoft.com/v1.0",
        "",
      );
    } else if (siguiente.startsWith("/solutions/")) {
      ruta = siguiente;
    } else {
      throw new Error(
        "Microsoft devolvió una ruta de paginación no reconocida.",
      );
    }
  }

  return correos;
}

async function crearCustomer(
  businessId: string,
  mentee: MenteeEntrada,
) {
  const payload = {
    "@odata.type": "#microsoft.graph.bookingCustomer",
    displayName: [mentee.nombres, mentee.apellidos]
      .filter(Boolean)
      .join(" "),
    emailAddress: mentee.email,
    addresses: [],
    phones: mentee.telefono
      ? [{ number: mentee.telefono, type: "mobile" }]
      : [],
  };

  return conReintentosGraph(() =>
    graphRequest<GraphCustomer>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/customers`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  );
}

async function importarUno(
  mentee: MenteeEntrada,
  businessId: string,
  correosBookings: Set<string>,
  redirectTo: string,
): Promise<ResultadoImportacion> {
  const email = normalizarEmail(mentee.email);
  const base = {
    email,
    nombres: mentee.nombres,
    apellidos: mentee.apellidos ?? "",
  };

  if (correosBookings.has(email)) {
    return {
      ...base,
      estado: "omitido",
      mensaje: "Ya existe en Microsoft Bookings.",
    };
  }

  let userId: string | null = null;
  let customerId: string | null = null;
  let rollbackFallido = false;

  try {
    const { data: existente, error: buscarError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (buscarError) throw buscarError;

    if ((existente ?? []).length > 0) {
      return {
        ...base,
        estado: "omitido",
        mensaje: "El correo ya existe en Supabase profiles.",
      };
    }

    // Crear cuenta sin contraseña temporal.
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          nombres: mentee.nombres,
          apellidos: mentee.apellidos ?? "",
        },
      });

    if (authError) {
      if (
        /already|registered|exists|duplicate/i.test(authError.message)
      ) {
        return {
          ...base,
          estado: "omitido",
          mensaje: "El correo ya está registrado en Supabase Auth.",
        };
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error("Supabase no devolvió el usuario creado.");
    }

    userId = authData.user.id;

    // Actualizar el perfil creado por el trigger de Auth.
    const { data: perfil, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        nombres: mentee.nombres,
        apellidos: mentee.apellidos || null,
        email,
        telefono: mentee.telefono || null,
        especialidad: mentee.especialidad || null,
        resumen: mentee.resumen || null,
        rol: "mentee",
        activo: true,
        cuenta_activada: false,
        microsoft_staff_id: null,
        microsoft_email: email,
      })
      .eq("id", userId)
      .select("id")
      .single();

    if (profileError || !perfil) {
      throw new Error(
        "No se pudo actualizar el perfil del nuevo mentee.",
      );
    }

    // Registrar al mentee en Microsoft Bookings.
    const customer = await crearCustomer(businessId, mentee);

    if (!customer.id) {
      throw new Error(
        "Microsoft Bookings no devolvió el ID del customer.",
      );
    }

    customerId = customer.id;
    correosBookings.add(email);

    // Registro completo: un fallo de correo NO revierte la cuenta.
    try {
      const { error: emailError } =
        await supabaseAdmin.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

      if (emailError) throw emailError;

      return {
        ...base,
        estado: "creado",
        invitacionEnviada: true,
        mensaje:
          "Registrado. Solicitud de correo de activación aceptada.",
      };
    } catch (errorCorreo) {
      console.error(
        "[importar-mentees] No se pudo solicitar correo:",
        email,
        errorCorreo,
      );

      return {
        ...base,
        estado: "creado",
        invitacionEnviada: false,
        mensaje:
          "Cuenta creada; envío pendiente. Usa Reenviar enlace en Gestión de mentees.",
      };
    }
  } catch (error) {
    // Revertir únicamente un registro incompleto.
    if (customerId) {
      try {
        await conReintentosGraph(() =>
          graphRequest(
            `/solutions/bookingBusinesses/${encodeURIComponent(
              businessId,
            )}/customers/${encodeURIComponent(customerId!)}`,
            { method: "DELETE" },
          ),
        );
        correosBookings.delete(email);
      } catch (rollbackError) {
        rollbackFallido = true;
        console.error(
          "[importar-mentees] Error rollback Bookings:",
          rollbackError,
        );
      }
    }

    if (userId) {
      try {
        const { error: deleteError } =
          await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) throw deleteError;
      } catch (rollbackError) {
        rollbackFallido = true;
        console.error(
          "[importar-mentees] Error rollback Supabase:",
          rollbackError,
        );
      }
    }

    console.error(
      "[importar-mentees] Error de registro:",
      email,
      error,
    );

    return {
      ...base,
      estado: "error",
      mensaje: rollbackFallido
        ? "Error de registro y reversión incompleta. Revisa Supabase y Bookings antes de reintentar."
        : error instanceof Error
          ? error.message
          : "No se pudo registrar al mentee.",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      !("mentees" in body) ||
      !Array.isArray(body.mentees)
    ) {
      return NextResponse.json(
        { error: "Debes enviar una lista de mentees." },
        { status: 400 },
      );
    }

    const entradas: unknown[] = body.mentees;

    if (entradas.length === 0 || entradas.length > MAX_POR_LOTE) {
      return NextResponse.json(
        {
          error: `Se permiten entre 1 y ${MAX_POR_LOTE} mentees por lote.`,
        },
        { status: 400 },
      );
    }

    const mentees: MenteeEntrada[] = [];
    const emailsLote = new Set<string>();

    for (const entrada of entradas) {
      if (!entrada || typeof entrada !== "object") {
        return NextResponse.json(
          { error: "Hay registros con formato incorrecto." },
          { status: 400 },
        );
      }

      const item = entrada as Record<string, unknown>;

      const mentee: MenteeEntrada = {
        nombres: texto(item.nombres),
        apellidos: texto(item.apellidos),
        email: normalizarEmail(texto(item.email)),
        telefono: texto(item.telefono),
        especialidad: texto(item.especialidad),
        resumen: texto(item.resumen),
      };

      if (
        !mentee.nombres ||
        !emailValido(mentee.email) ||
        mentee.nombres.length > 150 ||
        mentee.email.length > 254
      ) {
        return NextResponse.json(
          {
            error:
              "Uno de los registros tiene nombres o correo inválidos.",
          },
          { status: 400 },
        );
      }

      if (emailsLote.has(mentee.email)) {
        return NextResponse.json(
          {
            error: `Correo duplicado dentro del lote: ${mentee.email}`,
          },
          { status: 400 },
        );
      }

      emailsLote.add(mentee.email);
      mentees.push(mentee);
    }

    const businessId = getBookingBusinessId();

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "");

    if (!appUrl) {
      return NextResponse.json(
        { error: "Falta configurar NEXT_PUBLIC_APP_URL." },
        { status: 500 },
      );
    }

    const redirectTo = new URL(
      "/auth/activar-cuenta",
      appUrl,
    ).toString();

    const correosBookings =
      await obtenerCorreosBookings(businessId);

    const resultados: ResultadoImportacion[] = [];

    // Procesamiento secuencial para reducir throttling.
    for (const mentee of mentees) {
      const resultado = await importarUno(
        mentee,
        businessId,
        correosBookings,
        redirectTo,
      );

      resultados.push(resultado);
    }

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
    });
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error interno";

    if (mensaje === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "No autenticado." },
        { status: 401 },
      );
    }

    if (mensaje === "FORBIDDEN") {
      return NextResponse.json(
        { error: "No autorizado." },
        { status: 403 },
      );
    }

    console.error(
      "[importar-mentees] Error general:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudo procesar el lote. Revisa la conexión antes de reintentar.",
      },
      { status: 500 },
    );
  }
}
