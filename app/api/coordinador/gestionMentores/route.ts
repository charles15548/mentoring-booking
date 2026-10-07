import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

import { graphRequest, getBookingBusinessId } from "@/lib/microsoft-graph";

interface GraphBookingBusiness {
  id: string;
  displayName: string;
}

interface GraphStaffMember {
  id: string;
  displayName: string;
  emailAddress?: string;
  role?: string;
}

/* =========================================================
   SEGURIDAD
========================================================= */

export async function requireCoordinator(request: NextRequest) {
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

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single();

  if (!profile) {
    throw new Error("UNAUTHORIZED");
  }

  if (profile.rol !== "coordinador" || profile.activo !== true) {
    throw new Error("FORBIDDEN");
  }

  return user;
}

export function handleError(error: unknown) {
  console.error(error);

  const message = error instanceof Error ? error.message : "Error interno";

  if (message === "UNAUTHORIZED") {
    return NextResponse.json(
      {
        error: "No autenticado.",
      },
      {
        status: 401,
      },
    );
  }

  if (message === "FORBIDDEN") {
    return NextResponse.json(
      {
        error: "No autorizado.",
      },
      {
        status: 403,
      },
    );
  }

  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 500,
    },
  );
}

/* =========================================================
   GET
   LISTA SALE DE MICROSOFT BOOKINGS
========================================================= */

export async function GET(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const businessId = getBookingBusinessId();

    /* ===============================================
       BOOKING SELECCIONADO
    =============================================== */

    const business = await graphRequest<GraphBookingBusiness>(
      `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}`,
    );

    /* ===============================================
       PERSONAL REAL DE ESE BOOKING
    =============================================== */

    const staffResponse = await graphRequest<{
      value: GraphStaffMember[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers`,
    );

    /*
      Supabase NO genera la lista.

      Solo buscamos las cuentas vinculadas
      para saber si el mentor tiene acceso
      al sistema y para mostrar sus datos
      cuando exista una cuenta.
    */

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select(
        `
        id,
        nombres,
        apellidos,
        email,
        telefono,
        activo,
        microsoft_staff_id,
        microsoft_email
      `,
      )
      .eq("rol", "mentor");

    if (profilesError) {
      throw profilesError;
    }

    const mentors = staffResponse.value.map((staff) => {
      const profile = profiles?.find(
        (item) => item.microsoft_staff_id === staff.id,
      );

      /*
            Cuando el mentor tiene una cuenta
            vinculada, usamos el nombre guardado
            en Supabase.

            Si no tiene cuenta, usamos
            Microsoft Bookings.
          */

      const nombreSupabase = [profile?.nombres, profile?.apellidos]
        .filter(Boolean)
        .join(" ");

      return {
        /* ID principal = Microsoft */
        id: staff.id,

        staffId: staff.id,

        businessId: business.id,

        businessName: business.displayName,

        /*
              Nombre mostrado.
            */
        name: nombreSupabase || staff.displayName || "",

        /*
              Correo mostrado.
            */
        email: profile?.email ?? staff.emailAddress ?? "",

        role: staff.role ?? "",

        /* Datos Supabase */
        profileId: profile?.id ?? null,

        nombres: profile?.nombres ?? staff.displayName ?? "",

        apellidos: profile?.apellidos ?? "",

        telefono: profile?.telefono ?? "",

        activo: profile?.activo ?? true,

        tieneCuenta: Boolean(profile?.id),
      };
    });

    return NextResponse.json(mentors);
  } catch (error) {
    return handleError(error);
  }
}

/* =========================================================
   POST
   CREA CUENTA + STAFF
========================================================= */

export async function POST(request: NextRequest) {
  let userId: string | null = null;

  let staffId: string | null = null;

  const correlationId = crypto.randomUUID();

  const startedAt = Date.now();

  let stage = "authorize";

  const log = (event: string, details: Record<string, unknown> = {}) => {
    console.info(`[mentor-create:${event}]`, {
      correlationId,
      stage,
      durationMs: Date.now() - startedAt,
      ...details,
    });
  };

  const errorDetails = (error: unknown) => {
    if (typeof error !== "object" || error === null) {
      return {
        message: String(error),
      };
    }

    const value = error as {
      name?: string;
      message?: string;
      code?: string;
      status?: number;
      details?: string;
      hint?: string;
    };

    return {
      name: value.name,
      message: value.message,
      code: value.code,
      status: value.status,
      details: value.details,
      hint: value.hint,
    };
  };

  try {
    await requireCoordinator(request);

    stage = "validate";

    const body = await request.json();

    const nombres = body.nombres?.trim();

    const apellidos = body.apellidos?.trim() || "";

    const email = body.email?.trim().toLowerCase();

    const telefono = body.telefono?.trim() || "";

    const password = body.password?.trim();

    /* ===============================================
       LOG DE ENTRADA
    =============================================== */

    log("input", {
      email,
      emailWasNormalized: body.email !== email,
    });

    if (!nombres || !email || !password) {
      return NextResponse.json(
        {
          error: "Nombres, correo y contraseña son obligatorios.",
        },
        {
          status: 400,
        },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          error: "La contraseña debe tener mínimo 8 caracteres.",
        },
        {
          status: 400,
        },
      );
    }

    /* ===============================================
       1. CREAR USUARIO SUPABASE AUTH
    =============================================== */

    stage = "supabase-create-user";

    log("start");

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

    if (authError) {
      throw authError;
    }

    if (!authData.user) {
      throw new Error("No se pudo crear el usuario en Supabase.");
    }

    userId = authData.user.id;

    log("success", {
      userId,
    });

    /*
      El trigger crea automáticamente
      el profile.

      Lo convertimos a mentor.
    */

    stage = "supabase-update-profile";

    log("start", {
      userId,
    });

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        nombres,

        apellidos: apellidos || null,

        email,

        telefono: telefono || null,

        rol: "mentor",

        activo: true,
      })
      .eq("id", userId);

    if (profileError) {
      throw profileError;
    }

    log("success", {
      userId,
    });

    /* ===============================================
       2. CREAR MENTOR EN MICROSOFT BOOKINGS
    =============================================== */

    const businessId = getBookingBusinessId();

    stage = "bookings-create-staff";

    log("request", {
      businessId,

      emailAddress: email,

      role: "externalGuest",

      timeZone: "SA Pacific Standard Time",

      useBusinessHours: true,

      availabilityIsAffectedByPersonalCalendar: "not sent",
    });

    const staff = await graphRequest<GraphStaffMember>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers`,
      {
        method: "POST",

        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.bookingStaffMember",

          displayName: [nombres, apellidos].filter(Boolean).join(" "),

          emailAddress: email,

          role: "externalGuest",

          timeZone: "SA Pacific Standard Time",

          useBusinessHours: true,
        }),
      },
      {
        correlationId,
      },
    );

    staffId = staff.id;

    log("success", {
      staffId,

      emailAddress: staff.emailAddress,

      role: staff.role,
    });

    /* ===============================================
       3. VINCULAR SUPABASE CON MICROSOFT
    =============================================== */

    stage = "supabase-link-staff";

    log("start", {
      userId,
      staffId,
    });

    const { error: linkError } = await supabaseAdmin
      .from("profiles")
      .update({
        microsoft_staff_id: staff.id,

        microsoft_email: email,
      })
      .eq("id", userId);

    if (linkError) {
      throw linkError;
    }

    log("complete", {
      userId,
      staffId,
    });

    return NextResponse.json(
      {
        message: "Mentor creado correctamente.",

        mentor: {
          id: staff.id,

          staffId: staff.id,

          profileId: userId,

          name: staff.displayName,

          nombres,

          apellidos,

          email,

          telefono,

          activo: true,

          tieneCuenta: true,
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("[mentor-create:failed]", {
      correlationId,

      stage,

      userId,

      staffId,

      durationMs: Date.now() - startedAt,

      ...errorDetails(error),
    });

    /* ===============================================
       ROLLBACK BOOKINGS
    =============================================== */

    if (staffId) {
      try {
        stage = "rollback-bookings";

        log("start", {
          staffId,
        });

        const businessId = getBookingBusinessId();

        await graphRequest(
          `/solutions/bookingBusinesses/${encodeURIComponent(
            businessId,
          )}/staffMembers/${encodeURIComponent(staffId)}`,
          {
            method: "DELETE",
          },
          {
            correlationId,
          },
        );

        log("success", {
          staffId,
        });
      } catch (rollbackError) {
        console.error("[mentor-create:rollback-failed]", {
          correlationId,

          stage,

          staffId,

          ...errorDetails(rollbackError),
        });
      }
    }

    /* ===============================================
       ROLLBACK SUPABASE
    =============================================== */

    if (userId) {
      try {
        stage = "rollback-supabase";

        log("start", {
          userId,
        });

        const { error: deleteError } =
          await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
          throw deleteError;
        }

        log("success", {
          userId,
        });
      } catch (rollbackError) {
        console.error("[mentor-create:rollback-failed]", {
          correlationId,

          stage,

          userId,

          ...errorDetails(rollbackError),
        });
      }
    }

    const response = handleError(error);

    response.headers.set("X-Correlation-ID", correlationId);

    return response;
  }
}

/* =========================================================
   PUT
   EDITA MICROSOFT + SUPABASE
========================================================= */

export async function PUT(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const body = await request.json();

    const staffId = body.staffId ?? body.id;

    const profileId = body.profileId;

    const nombres = body.nombres?.trim();

    const apellidos = body.apellidos?.trim() || "";

    const email = body.email?.trim().toLowerCase();

    const telefono = body.telefono?.trim() || "";

    const activo = body.activo !== false;

    if (!staffId || !nombres || !email) {
      return NextResponse.json(
        {
          error: "Staff ID, nombres y correo son obligatorios.",
        },
        {
          status: 400,
        },
      );
    }

    const businessId = getBookingBusinessId();

    const nuevoNombre = [nombres, apellidos].filter(Boolean).join(" ");

    const correlationId = crypto.randomUUID();

    console.log("[mentor-update] Datos recibidos:", {
      staffId,

      profileId,

      businessId,

      nuevoNombre,

      email,

      correlationId,
    });

    /* ===============================================
       1. ACTUALIZAR MICROSOFT BOOKINGS
    =============================================== */

    console.log("[mentor-update] Actualizando Microsoft Bookings...");

    const datosMicrosoft = {
      "@odata.type": "#microsoft.graph.bookingStaffMember",

      displayName: nuevoNombre,

      emailAddress: email,
    };

    console.log("[mentor-update] Enviando a Microsoft:", datosMicrosoft);

    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers/${encodeURIComponent(staffId)}`,
      {
        method: "PATCH",

        body: JSON.stringify(datosMicrosoft),
      },
      {
        correlationId,
      },
    );

    console.log("[mentor-update] PATCH de Microsoft ejecutado correctamente.");

    /* ===============================================
       VERIFICAR MICROSOFT BOOKINGS
    =============================================== */

    console.log(
      "[mentor-update] Verificando mentor directamente en Microsoft Bookings...",
    );

    const staffVerificado = await graphRequest<GraphStaffMember>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers/${encodeURIComponent(staffId)}`,
      undefined,
      {
        correlationId,
      },
    );

    console.log("[mentor-update] Datos de Bookings después del PATCH:", {
      id: staffVerificado.id,

      displayName: staffVerificado.displayName,

      emailAddress: staffVerificado.emailAddress,

      role: staffVerificado.role,
    });

    /* ===============================================
       2. ACTUALIZAR SUPABASE
    =============================================== */

    if (profileId) {
      console.log("[mentor-update] Actualizando Supabase Auth...");

      const { error: authError } =
        await supabaseAdmin.auth.admin.updateUserById(profileId, {
          email,

          user_metadata: {
            nombres,
            apellidos,
          },
        });

      if (authError) {
        throw authError;
      }

      console.log("[mentor-update] Supabase Auth actualizado.");

      console.log("[mentor-update] Actualizando profiles...");

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          nombres,

          apellidos: apellidos || null,

          email,

          telefono: telefono || null,

          activo,

          microsoft_staff_id: staffId,

          microsoft_email: email,
        })
        .eq("id", profileId);

      if (profileError) {
        throw profileError;
      }

      console.log("[mentor-update] profiles actualizado.");
    }

    /* ===============================================
       RESPUESTA
    =============================================== */

    return NextResponse.json({
      message: "Mentor actualizado correctamente.",

      mentor: {
        id: staffId,

        staffId,

        profileId: profileId ?? null,

        name: nuevoNombre,

        nombres,

        apellidos,

        email,

        telefono,

        activo,
      },
    });
  } catch (error) {
    console.error("[mentor-update] Error:", error);

    return handleError(error);
  }
}

/* =========================================================
   DELETE
========================================================= */

export async function DELETE(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const body = await request.json();

    const staffId = body.staffId ?? body.id;

    const profileId = body.profileId ?? null;

    if (!staffId) {
      return NextResponse.json(
        {
          error: "El staffId es obligatorio.",
        },
        {
          status: 400,
        },
      );
    }

    /* ===============================================
       VERIFICAR RELACIONES DE MENTORÍA
    =============================================== */

    if (profileId) {
      const { count, error: pairError } = await supabaseAdmin
        .from("mentoring_pairs")
        .select("id", {
          count: "exact",

          head: true,
        })
        .eq("mentor_id", profileId);

      if (pairError) {
        throw pairError;
      }

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Este mentor ya tiene relaciones de mentoría registradas. No puede eliminarse; debe desactivarse.",
          },
          {
            status: 409,
          },
        );
      }
    }

    /* ===============================================
       1. ELIMINAR DE MICROSOFT BOOKINGS
    =============================================== */

    const businessId = getBookingBusinessId();

    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers/${encodeURIComponent(staffId)}`,
      {
        method: "DELETE",
      },
    );

    /* ===============================================
       2. ELIMINAR SUPABASE
    =============================================== */

    if (profileId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(profileId);

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({
      message: "Mentor eliminado correctamente.",
    });
  } catch (error) {
    return handleError(error);
  }
}
