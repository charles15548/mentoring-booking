import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

interface GraphBookingBusiness {
  id: string;
  displayName: string;
}

interface GraphPhone {
  number?: string;
  type?: string;
}

interface GraphBookingCustomer {
  id: string;
  displayName: string;
  emailAddress?: string;
  phones?: GraphPhone[];
}

/* =========================================================
   SEGURIDAD
========================================================= */

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

  return user;
}

function handleError(error: unknown) {
  console.error(error);

  const message = error instanceof Error ? error.message : "Error interno";

  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function buildCustomerPayload(
  nombres: string,
  apellidos: string,
  email: string,
  telefono: string,
) {
  return {
    "@odata.type": "#microsoft.graph.bookingCustomer",
    displayName: [nombres, apellidos].filter(Boolean).join(" "),
    emailAddress: email,
    addresses: [],
    phones: telefono
      ? [
          {
            number: telefono,
            type: "mobile",
          },
        ]
      : [],
  };
}

/* =========================================================
   GET
   LISTA DE MENTEES DESDE MICROSOFT BOOKINGS

   La relación con profiles se resuelve por correo porque el
   SQL actual no posee microsoft_customer_id en profiles.
========================================================= */

export async function GET(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const businessId = getBookingBusinessId();

    const [business, customersResponse] = await Promise.all([
      graphRequest<GraphBookingBusiness>(
        `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}`,
      ),
      graphRequest<{ value?: GraphBookingCustomer[] }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/customers`,
      ),
    ]);

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select(
        `
          id,
          nombres,
          apellidos,
          email,
          telefono,
          especialidad,
          foto_url,
          resumen,
          activo,
          microsoft_email
        `,
      )
      .eq("rol", "mentee");

    if (profilesError) {
      throw profilesError;
    }

    const profilesByEmail = new Map(
      (profiles ?? []).map((profile) => [normalizeEmail(profile.email), profile]),
    );

    const mentees = (customersResponse.value ?? []).map((customer) => {
      const customerEmail = normalizeEmail(customer.emailAddress);
      const profile = profilesByEmail.get(customerEmail);

      return {
        /* ID principal de esta pantalla = customer ID de Bookings */
        id: customer.id,
        customerId: customer.id,

        businessId: business.id,
        businessName: business.displayName,

        name: customer.displayName,
        email: customerEmail,

        /* Datos de Supabase cuando existe una cuenta vinculada */
        profileId: profile?.id ?? null,
        nombres: profile?.nombres ?? customer.displayName ?? "",
        apellidos: profile?.apellidos ?? "",
        telefono:
          profile?.telefono ?? customer.phones?.[0]?.number ?? "",
        especialidad: profile?.especialidad ?? "",
        foto_url: profile?.foto_url ?? "",
        resumen: profile?.resumen ?? "",
        activo: profile?.activo ?? true,
        tieneCuenta: Boolean(profile?.id),
      };
    });

    return NextResponse.json(mentees);
  } catch (error) {
    return handleError(error);
  }
}

/* =========================================================
   POST
   CREA CUENTA DE MENTEE + CUSTOMER EN MICROSOFT BOOKINGS
========================================================= */

export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let customerId: string | null = null;

  try {
    await requireCoordinator(request);

    const body = await request.json();

    const nombres = body.nombres?.trim();
    const apellidos = body.apellidos?.trim() || "";
    const email = normalizeEmail(body.email);
    const telefono = body.telefono?.trim() || "";
    const especialidad = body.especialidad?.trim() || "";
    const foto_url = body.foto_url?.trim() || "";
    const resumen = body.resumen?.trim() || "";
    const password = body.password?.trim();

    if (!nombres || !email || !password) {
      return NextResponse.json(
        { error: "Nombres, correo y contraseña son obligatorios." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener mínimo 8 caracteres." },
        { status: 400 },
      );
    }

    /* 1. Crear usuario en Supabase Auth. */
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nombres,
          apellidos,
        },
      });

    if (authError) throw authError;

    if (!authData.user) {
      throw new Error("No se pudo crear el usuario en Supabase.");
    }

    userId = authData.user.id;

    /*
      El trigger existente crea profiles con rol mentee. Se actualizan
      sus datos sin modificar el esquema SQL.
    */
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        nombres,
        apellidos: apellidos || null,
        email,
        telefono: telefono || null,
        especialidad: especialidad || null,
        foto_url: foto_url || null,
        resumen: resumen || null,
        rol: "mentee",
        activo: true,
        microsoft_staff_id: null,
        microsoft_email: email,
      })
      .eq("id", userId);

    if (profileError) throw profileError;

    /* 2. Crear al mentee como customer de Microsoft Bookings. */
    const businessId = getBookingBusinessId();
    const customer = await graphRequest<GraphBookingCustomer>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/customers`,
      {
        method: "POST",
        body: JSON.stringify(
          buildCustomerPayload(nombres, apellidos, email, telefono),
        ),
      },
    );

    customerId = customer.id;

    return NextResponse.json(
      {
        message: "Mentee creado correctamente.",
        mentee: {
          id: customer.id,
          customerId: customer.id,
          profileId: userId,
          name: customer.displayName,
          nombres,
          apellidos,
          email,
          telefono,
          especialidad,
          foto_url,
          resumen,
          activo: true,
          tieneCuenta: true,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    /* Rollback: elimina los recursos que sí llegaron a crearse. */
    if (customerId) {
      try {
        const businessId = getBookingBusinessId();

        await graphRequest(
          `/solutions/bookingBusinesses/${encodeURIComponent(
            businessId,
          )}/customers/${encodeURIComponent(customerId)}`,
          { method: "DELETE" },
        );
      } catch (rollbackError) {
        console.error("No se pudo revertir el customer de Bookings", rollbackError);
      }
    }

    if (userId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (rollbackError) {
        console.error("No se pudo revertir el usuario de Supabase", rollbackError);
      }
    }

    return handleError(error);
  }
}

/* =========================================================
   PUT
   EDITA CUSTOMER DE BOOKINGS + CUENTA DE SUPABASE
========================================================= */

export async function PUT(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const body = await request.json();

    const customerId = body.customerId ?? body.id;
    const profileId = body.profileId ?? null;

    const nombres = body.nombres?.trim();
    const apellidos = body.apellidos?.trim() || "";
    const email = normalizeEmail(body.email);
    const telefono = body.telefono?.trim() || "";
    const especialidad = body.especialidad?.trim() || "";
    const foto_url = body.foto_url?.trim() || "";
    const resumen = body.resumen?.trim() || "";
    const activo = body.activo !== false;

    if (!customerId || !nombres || !email) {
      return NextResponse.json(
        { error: "Customer ID, nombres y correo son obligatorios." },
        { status: 400 },
      );
    }

    const businessId = getBookingBusinessId();

    /* 1. Actualizar el customer en Microsoft Bookings. */
    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/customers/${encodeURIComponent(customerId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(
          buildCustomerPayload(nombres, apellidos, email, telefono),
        ),
      },
    );

    /* 2. Actualizar Supabase cuando el customer tiene cuenta. */
    if (profileId) {
      const { error: authError } =
        await supabaseAdmin.auth.admin.updateUserById(profileId, {
          email,
          user_metadata: {
            nombres,
            apellidos,
          },
        });

      if (authError) throw authError;

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          nombres,
          apellidos: apellidos || null,
          email,
          telefono: telefono || null,
          especialidad: especialidad || null,
          foto_url: foto_url || null,
          resumen: resumen || null,
          rol: "mentee",
          activo,
          microsoft_staff_id: null,
          microsoft_email: email,
        })
        .eq("id", profileId);

      if (profileError) throw profileError;
    }

    return NextResponse.json({
      message: "Mentee actualizado correctamente.",
    });
  } catch (error) {
    return handleError(error);
  }
}

/* =========================================================
   DELETE
   ELIMINA CUSTOMER DE BOOKINGS + CUENTA DE SUPABASE
========================================================= */

export async function DELETE(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const body = await request.json();

    const customerId = body.customerId ?? body.id;
    const profileId = body.profileId ?? null;

    if (!customerId) {
      return NextResponse.json(
        { error: "El customerId es obligatorio." },
        { status: 400 },
      );
    }

    /*
      Si ya tiene una relación de mentoría, se conserva el historial.
      En ese caso debe desactivarse mediante PUT en vez de eliminarse.
    */
    if (profileId) {
      const { count, error: pairError } = await supabaseAdmin
        .from("mentoring_pairs")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("mentee_id", profileId);

      if (pairError) throw pairError;

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Este mentee ya tiene relaciones de mentoría registradas. No puede eliminarse; debe desactivarse.",
          },
          { status: 409 },
        );
      }
    }

    /* 1. Eliminar al customer de Microsoft Bookings. */
    const businessId = getBookingBusinessId();

    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/customers/${encodeURIComponent(customerId)}`,
      { method: "DELETE" },
    );

    /* 2. Eliminar Supabase Auth; el perfil cae por ON DELETE CASCADE. */
    if (profileId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(profileId);

      if (error) throw error;
    }

    return NextResponse.json({
      message: "Mentee eliminado correctamente.",
    });
  } catch (error) {
    return handleError(error);
  }
}
