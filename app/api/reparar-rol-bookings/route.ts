
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  timingSafeEqual,
} from "node:crypto";

import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   RECUPERACIÓN DEL ROL ADMINISTRATIVO DE CEA

   GET:
   - Consulta el rol actual.
   - Utiliza los valores ampliados de Microsoft Graph.
   - No modifica Bookings.

   POST:
   - Verifica la identidad de CEA.
   - Verifica su rol actual.
   - Actualiza únicamente el rol a administrator.
   - Consulta nuevamente el resultado.

   SEGURIDAD:
   - Solo disponible en desarrollo.
   - Requiere clave de diagnóstico.
   - Requiere confirmación explícita.
   - No modifica mentores ni servicios.
========================================================= */

const CEA_EMAIL =
  "intranet@PATRONATODELAUNI.onmicrosoft.com";

const CEA_STAFF_ID =
  "5fc6267a-fe3d-4eef-9e42-575b67909038";

const EXPECTED_BUSINESS_ID =
  "Agendarmentoras@PATRONATODELAUNI.onmicrosoft.com";

const CONFIRMATION =
  "CONFIRMAR_ADMINISTRADOR_CEA";

interface BookingStaff {
  id: string;
  displayName?: string;
  emailAddress?: string;
  role?: string;
}

/* =========================================================
   SEGURIDAD
========================================================= */

function authorized(request: NextRequest): boolean {
  const expected =
    process.env.BOOKINGS_DIAGNOSTIC_KEY;

  const provided =
    request.headers.get("x-diagnostic-key");

  if (!expected || !provided) {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(provided);

  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

function validateRequest(
  request: NextRequest,
): NextResponse | null {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Ruta no disponible." },
      { status: 404 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Acceso no autorizado." },
      { status: 401 },
    );
  }

  const businessId = getBookingBusinessId();

  if (
    businessId.toLowerCase() !==
    EXPECTED_BUSINESS_ID.toLowerCase()
  ) {
    return NextResponse.json(
      {
        error:
          "La página de Bookings no corresponde a la esperada.",
      },
      { status: 409 },
    );
  }

  return null;
}

/* =========================================================
   CONSULTAR PERSONAL DE CEA

   La cabecera Prefer permite solicitar los
   valores ampliados de enumeraciones de Graph.
========================================================= */

async function getCeaStaff(): Promise<BookingStaff> {
  const businessId = getBookingBusinessId();

  const staff = await graphRequest<BookingStaff>(
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId,
    )}/staffMembers/${encodeURIComponent(
      CEA_STAFF_ID,
    )}`,
    {
      headers: {
        Prefer: "include-unknown-enum-members",
      },
    },
  );

  if (
    staff.id !== CEA_STAFF_ID ||
    staff.emailAddress?.trim().toLowerCase() !==
      CEA_EMAIL.toLowerCase()
  ) {
    throw new Error(
      "La identidad del personal no coincide con CEA Patronato.",
    );
  }

  return staff;
}

/* =========================================================
   GET: CONSULTA PREVIA
========================================================= */

export async function GET(request: NextRequest) {
  const validation = validateRequest(request);

  if (validation) {
    return validation;
  }

  try {
    const staff = await getCeaStaff();

    return NextResponse.json(
      {
        success: true,
        nombre: staff.displayName,
        correo: staff.emailAddress,
        staffId: staff.id,
        rolActual: staff.role,
        rolObjetivo: "administrator",
        requiereCambio:
          staff.role !== "administrator",
        cambiosRealizados: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "[reparar-rol-bookings][GET]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo verificar el rol de CEA Patronato.",
      },
      { status: 500 },
    );
  }
}

/* =========================================================
   POST: RECUPERAR ADMINISTRACIÓN
========================================================= */

export async function POST(request: NextRequest) {
  const validation = validateRequest(request);

  if (validation) {
    return validation;
  }

  let body: { confirmacion?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Solicitud no válida." },
      { status: 400 },
    );
  }

  if (body.confirmacion !== CONFIRMATION) {
    return NextResponse.json(
      {
        error:
          "Falta la confirmación del cambio.",
      },
      { status: 400 },
    );
  }

  try {
    const staffBefore = await getCeaStaff();

    if (staffBefore.role === "administrator") {
      return NextResponse.json({
        success: true,
        mensaje:
          "CEA Patronato ya tiene el rol de administrador.",
        rolAnterior: "administrator",
        rolActual: "administrator",
        cambiosRealizados: false,
      });
    }

    if (
      staffBefore.role !== "member" &&
      staffBefore.role !== "teamMember"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El rol actual es diferente del esperado. No se realizaron cambios.",
          rolActual: staffBefore.role,
        },
        { status: 409 },
      );
    }

    const businessId = getBookingBusinessId();

    await graphRequest<BookingStaff>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers/${encodeURIComponent(
        CEA_STAFF_ID,
      )}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "include-unknown-enum-members",
        },
        body: JSON.stringify({
          role: "administrator",
        }),
      },
    );

    const staffAfter = await getCeaStaff();

    const verified =
      staffAfter.role === "administrator";

    console.info(
      "[reparar-rol-bookings] Resultado:",
      {
        staffId: CEA_STAFF_ID,
        rolAnterior: staffBefore.role,
        rolActual: staffAfter.role,
        verificado: verified,
      },
    );

    return NextResponse.json(
      {
        success: verified,
        mensaje: verified
          ? "El rol administrativo de CEA Patronato se actualizó correctamente."
          : "Microsoft Graph aceptó la solicitud, pero todavía no se confirmó el nuevo rol.",
        rolAnterior: staffBefore.role,
        rolActual: staffAfter.role,
        cambiosRealizados: true,
        verificado: verified,
      },
      {
        status: verified ? 200 : 202,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "[reparar-rol-bookings][POST]",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "No se pudo completar o verificar la actualización. Consulta nuevamente el rol antes de repetir la operación.",
      },
      { status: 500 },
    );
  }
}
