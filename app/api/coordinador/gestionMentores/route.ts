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



  especialidad,



  resumen,



  foto_url,



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
        id: staff.id,

        staffId: staff.id,

        businessId: business.id,

        businessName: business.displayName,

        name: nombreSupabase || staff.displayName || "",

        email: profile?.email ?? staff.emailAddress ?? "",

        role: staff.role ?? "",

        profileId: profile?.id ?? null,

        nombres: profile?.nombres ?? staff.displayName ?? "",

        apellidos: profile?.apellidos ?? "",

        telefono: profile?.telefono ?? "",

        especialidad: profile?.especialidad ?? "",

        resumen: profile?.resumen ?? "",

        foto_url: profile?.foto_url ?? "",

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
  let registroCompletado = false;

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
      return { message: String(error) };
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
    // =========================================
    // 1. AUTORIZAR COORDINADOR
    // =========================================

    await requireCoordinator(request);

    stage = "validate";

    const body = await request.json();

    const nombres = typeof body.nombres === "string" ? body.nombres.trim() : "";

    const apellidos =
      typeof body.apellidos === "string" ? body.apellidos.trim() : "";

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() : "";

    const resumen = typeof body.resumen === "string" ? body.resumen.trim() : "";

    const especialidad =
      typeof body.especialidad === "string" ? body.especialidad.trim() : "";

    const foto_url =
      typeof body.foto_url === "string" ? body.foto_url.trim() : "";

    log("input", {
      email,
      emailWasNormalized: body.email !== email,
    });

    if (!nombres || !email) {
      return NextResponse.json(
        {
          error: "Los nombres y el correo son obligatorios.",
        },
        { status: 400 },
      );
    }

    if (
      nombres.length > 150 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        {
          error: "Los nombres o el correo tienen un formato inválido.",
        },
        { status: 400 },
      );
    }

    // No se solicita una contraseña al administrador.

    // =========================================
    // 2. CONFIGURAR ENLACE DE ACTIVACIÓN
    // =========================================

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");

    if (!appUrl) {
      return NextResponse.json(
        {
          error:
            "Falta configurar NEXT_PUBLIC_APP_URL para enviar enlaces de activación.",
        },
        { status: 500 },
      );
    }

    const redirectTo = new URL("/auth/activar-cuenta", appUrl).toString();

    const businessId = getBookingBusinessId();

    // =========================================
    // 3. VERIFICAR DUPLICADOS
    // =========================================

    stage = "check-duplicates";

    const { data: existingProfiles, error: lookupError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .limit(1);

    if (lookupError) {
      throw lookupError;
    }

    if ((existingProfiles ?? []).length > 0) {
      return NextResponse.json(
        {
          error: "Ya existe una cuenta registrada con este correo en ProUni.",
        },
        { status: 409 },
      );
    }

    const staffResponse = await graphRequest<{
      value?: GraphStaffMember[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers`,
    );

    const staffExistente = (staffResponse.value ?? []).some(
      (item) => item.emailAddress?.trim().toLowerCase() === email,
    );

    if (staffExistente) {
      return NextResponse.json(
        {
          error:
            "Este correo ya está registrado como mentor en Microsoft Bookings.",
        },
        { status: 409 },
      );
    }

    // =========================================
    // 4. CREAR USUARIO EN SUPABASE AUTH
    //    SIN CONTRASEÑA TEMPORAL
    // =========================================

    stage = "supabase-create-user";

    log("start");

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          nombres,
          apellidos,
        },
      });

    if (authError) {
      if (/already|registered|exists|duplicate/i.test(authError.message)) {
        return NextResponse.json(
          {
            error: "El correo ya existe en Supabase Authentication.",
          },
          { status: 409 },
        );
      }

      throw authError;
    }

    if (!authData.user) {
      throw new Error("Supabase no devolvió el usuario creado.");
    }

    userId = authData.user.id;

    log("success", { userId });

    // =========================================
    // 5. ACTUALIZAR PROFILE
    // =========================================

    stage = "supabase-update-profile";

    log("start", { userId });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        nombres,
        apellidos: apellidos || null,
        email,
        telefono: telefono || null,
        especialidad: especialidad || null,
        foto_url: foto_url || null,
        resumen: resumen || null,
        rol: "mentor",
        activo: true,
        cuenta_activada: false,
        microsoft_staff_id: null,
        microsoft_email: email,
      })
      .eq("id", userId)
      .select("id")
      .single();

    if (profileError || !profile) {
      throw new Error("No se pudo actualizar el perfil del nuevo mentor.");
    }

    log("success", { userId });

    // =========================================
    // 6. CREAR STAFF EN MICROSOFT BOOKINGS
    // =========================================

    stage = "bookings-create-staff";

    log("request", {
      businessId,
      emailAddress: email,
      role: "externalGuest",
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

    if (!staff.id) {
      throw new Error(
        "Microsoft Bookings no devolvió el identificador del mentor.",
      );
    }

    staffId = staff.id;

    log("success", {
      staffId,
      role: staff.role,
    });

    // =========================================
    // 7. VINCULAR PROFILE CON BOOKINGS
    // =========================================

    stage = "supabase-link-staff";

    const { data: linkedProfile, error: linkError } = await supabaseAdmin
      .from("profiles")
      .update({
        microsoft_staff_id: staff.id,
        microsoft_email: email,
      })
      .eq("id", userId)
      .select("id")
      .single();

    if (linkError || !linkedProfile) {
      throw new Error("No se pudo vincular el mentor con Microsoft Bookings.");
    }

    registroCompletado = true;

    log("registered", {
      userId,
      staffId,
    });

    // =========================================
    // 8. ENVIAR CORREO DE ACTIVACIÓN
    //
    // Si falla el correo, NO eliminamos al mentor.
    // =========================================

    stage = "send-activation";

    let invitacionEnviada = false;

    try {
      const { error: emailError } =
        await supabaseAdmin.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

      if (emailError) {
        throw emailError;
      }

      invitacionEnviada = true;

      log("activation-requested", { email });
    } catch (emailError) {
      console.error("[mentor-create:activation-failed]", {
        correlationId,
        userId,
        staffId,
        ...errorDetails(emailError),
      });
    }

    // =========================================
    // 9. RESPUESTA
    // =========================================

    stage = "complete";

    return NextResponse.json(
      {
        message: invitacionEnviada
          ? "Mentor registrado. Se solicitó el envío del correo de activación."
          : "Mentor registrado correctamente, pero el correo de activación está pendiente de envío.",

        invitacionEnviada,

        mentor: {
          id: staff.id,
          staffId: staff.id,
          profileId: userId,
          name: staff.displayName,
          nombres,
          apellidos,
          email,
          telefono,
          especialidad,
          resumen,
          foto_url,
          activo: true,
          cuenta_activada: false,
          tieneCuenta: true,
        },
      },
      { status: 201 },
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

    // =========================================
    // 10. ROLLBACK SOLO SI EL REGISTRO FALLÓ
    // =========================================

    if (!registroCompletado) {
      if (staffId) {
        try {
          stage = "rollback-bookings";

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

          log("rollback-bookings-success", {
            staffId,
          });
        } catch (rollbackError) {
          console.error("[mentor-create:rollback-bookings-failed]", {
            correlationId,
            staffId,
            ...errorDetails(rollbackError),
          });
        }
      }

      if (userId) {
        try {
          stage = "rollback-supabase";

          const { error: deleteError } =
            await supabaseAdmin.auth.admin.deleteUser(userId);

          if (deleteError) {
            throw deleteError;
          }

          log("rollback-supabase-success", {
            userId,
          });
        } catch (rollbackError) {
          console.error("[mentor-create:rollback-supabase-failed]", {
            correlationId,
            userId,
            ...errorDetails(rollbackError),
          });
        }
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

    const resumen = body.resumen?.trim() || "";

    const telefono = body.telefono?.trim() || "";

    const especialidad = body.especialidad?.trim() || "";

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

          especialidad: especialidad || null,

          resumen: resumen || null,

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

        especialidad,

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

/* =========================================================

   DELETE

   ELIMINAR MENTOR CON VALIDACIÓN DE ASIGNACIONES

========================================================= */

export async function DELETE(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const body = await request.json();

    const staffId = body.staffId ?? body.id;

    const submittedProfileId = body.profileId ?? null;

    if (!staffId || typeof staffId !== "string") {
      return NextResponse.json(
        { error: "El staffId es obligatorio." },

        { status: 400 },
      );
    }

    const businessId = getBookingBusinessId();

    /* =====================================================

       1. VERIFICAR MENTOR EN MICROSOFT BOOKINGS

    ===================================================== */

    const staffResponse = await graphRequest<{
      value?: GraphStaffMember[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers`,
    );

    const staff = (staffResponse.value ?? []).find(
      (item) => item.id === staffId,
    );

    if (!staff) {
      return NextResponse.json(
        {
          error:
            "No se encontró al mentor en Microsoft Bookings. No se eliminó ninguna cuenta.",
        },

        { status: 404 },
      );
    }

    const email = staff.emailAddress?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        {
          error:
            "El mentor no tiene un correo válido en Bookings. No se puede verificar su vinculación.",
        },

        { status: 409 },
      );
    }

    /* =====================================================

       2. IDENTIFICAR PERFIL EN SUPABASE

    ===================================================== */

    const { data: profiles, error: profileError } = await supabaseAdmin

      .from("profiles")

      .select("id, email, rol, microsoft_staff_id")

      .eq("rol", "mentor")

      .eq("microsoft_staff_id", staffId);

    if (profileError) {
      throw profileError;
    }

    if (!profiles || profiles.length !== 1) {
      return NextResponse.json(
        {
          error:
            "No se encontró una vinculación única del mentor con Supabase. Se bloqueó la eliminación.",
        },

        { status: 409 },
      );
    }

    const profile = profiles[0];

    const profileId = profile.id;

    if (profile.email?.trim().toLowerCase() !== email) {
      return NextResponse.json(
        {
          error:
            "El correo del mentor no coincide entre Supabase y Microsoft Bookings. Se bloqueó la eliminación.",
        },

        { status: 409 },
      );
    }

    if (submittedProfileId && submittedProfileId !== profileId) {
      return NextResponse.json(
        {
          error:
            "Los identificadores del mentor no coinciden. Se bloqueó la eliminación.",
        },

        { status: 409 },
      );
    }

    /* =====================================================

       3. VERIFICAR CUENTA EN SUPABASE AUTH

    ===================================================== */

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(profileId);

    if (
      authError ||
      !authData.user ||
      authData.user.email?.trim().toLowerCase() !== email
    ) {
      return NextResponse.json(
        {
          error:
            "No se pudo verificar la cuenta del mentor en Authentication. Se bloqueó la eliminación.",
        },

        { status: 409 },
      );
    }

    /* =====================================================

       4. VERIFICAR ASIGNACIONES EN SUPABASE

    ===================================================== */

    const { count, error: assignmentError } = await supabaseAdmin

      .from("mentor_assignments")

      .select("id", {
        count: "exact",

        head: true,
      })

      .eq("mentor_id", profileId);

    if (assignmentError) {
      throw assignmentError;
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Este mentor tiene asignaciones de mentoría registradas. No puede eliminarse; debe desactivarse.",
        },

        { status: 409 },
      );
    }

    /* =====================================================

       5. ELIMINAR DE MICROSOFT BOOKINGS

    ===================================================== */

    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/staffMembers/${encodeURIComponent(staffId)}`,

      {
        method: "DELETE",
      },
    );

    /* =====================================================

       6. ELIMINAR CUENTA DE SUPABASE

    ===================================================== */

    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(profileId);

    if (deleteError) {
      console.error("[mentor-delete] Eliminación parcial", {
        staffId,

        profileId,

        error: deleteError,
      });

      return NextResponse.json(
        {
          error:
            "El mentor fue eliminado de Bookings, pero no de Supabase. Se requiere corregir la sincronización.",

          synchronization: "partial_failure",
        },

        { status: 502 },
      );
    }

    return NextResponse.json({
      message: "Mentor eliminado correctamente.",
    });
  } catch (error) {
    return handleError(error);
  }
}
