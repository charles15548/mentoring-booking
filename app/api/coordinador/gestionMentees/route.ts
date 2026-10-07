import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBookingBusinessId, graphRequest } from "@/lib/microsoft-graph";

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

interface GraphAppointmentCustomer {
  "@odata.type"?: string;
  customerId?: string;
  name?: string;
  emailAddress?: string;
  phone?: string;
  timeZone?: string;
}

interface GraphBookingAppointment {
  id: string;

  customerId?: string;

  customerName?: string;

  customerEmailAddress?: string;

  customerPhone?: string;

  customers?: GraphAppointmentCustomer[];

  staffMemberIds?: string[];

  serviceName?: string;

  startDateTime?: {
    dateTime?: string;
    timeZone?: string;
  };

  endDateTime?: {
    dateTime?: string;
    timeZone?: string;
  };
}

/* =========================================================
   CONFIGURACIÓN DE SINCRONIZACIÓN
========================================================= */

/*
  Microsoft puede responder "Too Many Requests" si enviamos
  demasiadas actualizaciones de reservas al mismo tiempo.

  Por eso limitamos la cantidad de reservas simultáneas.
*/
const APPOINTMENT_BATCH_SIZE = 3;

/*
  Cantidad máxima de intentos por reserva.

  Intento 1
  Intento 2
  Intento 3
*/
const APPOINTMENT_MAX_RETRIES = 3;

/*
  Tiempo inicial de espera antes de volver a intentar.

  El tiempo aumenta progresivamente:
    intento 1 → 1500 ms
    intento 2 → 3000 ms
*/
const APPOINTMENT_RETRY_DELAY_MS = 1500;

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

/* =========================================================
   ERRORES
========================================================= */

function handleError(error: unknown) {
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
   UTILIDADES
========================================================= */

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
   CONSTRUIR CUSTOMERS DE UNA RESERVA

   Microsoft indica que cuando se actualiza "customers",
   la colección es un reemplazo completo.

   Por eso conservamos todos los customers existentes
   y solamente modificamos el que corresponde al mentee.
========================================================= */

function buildUpdatedAppointmentCustomers(
  customers: GraphAppointmentCustomer[] | undefined,
  customerId: string,
  oldEmail: string,
  newName: string,
  newEmail: string,
  newPhone: string,
) {
  if (!customers || customers.length === 0) {
    return undefined;
  }

  let found = false;

  const updated = customers.map((customer) => {
    const customerEmail = normalizeEmail(customer.emailAddress);

    const matches =
      customer.customerId === customerId ||
      (oldEmail && customerEmail === oldEmail) ||
      (newEmail && customerEmail === newEmail);

    if (!matches) {
      return {
        ...customer,
        "@odata.type":
          customer["@odata.type"] ??
          "#microsoft.graph.bookingCustomerInformation",
      };
    }

    found = true;

    return {
      ...customer,

      "@odata.type":
        customer["@odata.type"] ??
        "#microsoft.graph.bookingCustomerInformation",

      customerId: customer.customerId ?? customerId,

      name: newName,

      emailAddress: newEmail,

      phone: newPhone || undefined,
    };
  });

  return found ? updated : undefined;
}

/* =========================================================
   BUSCAR RESERVAS DEL MENTEE

   Se consideran reservas del mentee cuando:

   1. customerId de la cita coincide.
   2. customerId dentro de customers coincide.
   3. El correo anterior coincide.
   4. El correo nuevo coincide.

   Esto permite actualizar reservas antiguas y nuevas.
========================================================= */

function appointmentBelongsToCustomer(
  appointment: GraphBookingAppointment,
  customerId: string,
  oldEmail: string,
  newEmail: string,
) {
  if (appointment.customerId === customerId) {
    return true;
  }

  const appointmentEmail = normalizeEmail(appointment.customerEmailAddress);

  if (oldEmail && appointmentEmail === oldEmail) {
    return true;
  }

  if (newEmail && appointmentEmail === newEmail) {
    return true;
  }

  return (
    appointment.customers?.some((customer) => {
      if (customer.customerId === customerId) {
        return true;
      }

      const email = normalizeEmail(customer.emailAddress);

      return (
        (oldEmail && email === oldEmail) || (newEmail && email === newEmail)
      );
    }) ?? false
  );
}

/* =========================================================
   DETECTAR TOO MANY REQUESTS

   Microsoft puede devolver el error de limitación como
   "Too Many Requests".

   En nuestra prueba apareció incluso acompañado de
   status 500 InternalServerError.

   Por eso no dependemos únicamente del código HTTP.
========================================================= */

function isTooManyRequestsError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message.toLowerCase().includes("too many requests");
}

/* =========================================================
   ESPERA
========================================================= */

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/* =========================================================
   ACTUALIZAR UNA RESERVA CON REINTENTOS

   Si Microsoft responde Too Many Requests:

   Intento 1
      ↓
   esperar 1.5 s
      ↓
   Intento 2
      ↓
   esperar 3 s
      ↓
   Intento 3

   Si después de los 3 intentos falla,
   dejamos que el error llegue al proceso principal.
========================================================= */

async function actualizarReservaConReintento(
  appointment: GraphBookingAppointment,
  businessId: string,
  customerId: string,
  oldEmail: string,
  nuevoNombre: string,
  email: string,
  telefono: string,
  correlationId: string,
) {
  const updatedCustomers = buildUpdatedAppointmentCustomers(
    appointment.customers,
    customerId,
    oldEmail,
    nuevoNombre,
    email,
    telefono,
  );

  const appointmentPayload: Record<string, unknown> = {
    "@odata.type": "#microsoft.graph.bookingAppointment",

    customerName: nuevoNombre,

    customerEmailAddress: email,

    customerPhone: telefono,
  };

  /*
    Solo enviamos customers si la reserva
    realmente tiene esa colección y encontramos
    al mentee dentro de ella.
  */
  if (updatedCustomers) {
    appointmentPayload.customers = updatedCustomers;
  }

  for (
    let intento = 1;
    intento <= APPOINTMENT_MAX_RETRIES;
    intento++
  ) {
    try {
      console.log("[mentee-update] Actualizando reserva:", {
        appointmentId: appointment.id,

        intento,

        maxIntentos: APPOINTMENT_MAX_RETRIES,

        customerName: nuevoNombre,

        customerEmailAddress: email,

        customerPhone: telefono,

        actualizaCustomers: Boolean(updatedCustomers),
      });

      await graphRequest(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/appointments/${encodeURIComponent(appointment.id)}`,
        {
          method: "PATCH",

          body: JSON.stringify(appointmentPayload),
        },
        {
          correlationId,
        },
      );

      console.log(
        "[mentee-update] Reserva actualizada correctamente:",
        appointment.id,
        {
          intento,
        },
      );

      return appointment.id;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";

      const tooManyRequests = isTooManyRequestsError(error);

      console.error("[mentee-update] Error actualizando reserva:", {
        appointmentId: appointment.id,

        intento,

        maxIntentos: APPOINTMENT_MAX_RETRIES,

        tooManyRequests,

        error: message,
      });

      /*
        Si no es un error de límite de Microsoft,
        no tiene sentido repetir automáticamente.
      */
      if (!tooManyRequests) {
        throw error;
      }

      /*
        Si todavía quedan intentos,
        esperamos antes de volver a enviar.
      */
      if (intento < APPOINTMENT_MAX_RETRIES) {
        const delay =
          APPOINTMENT_RETRY_DELAY_MS * intento;

        console.log(
          "[mentee-update] Microsoft limitó la solicitud.",
          {
            appointmentId: appointment.id,

            siguienteIntento: intento + 1,

            esperaMs: delay,
          },
        );

        await wait(delay);
      } else {
        console.error(
          "[mentee-update] Se agotaron los reintentos:",
          {
            appointmentId: appointment.id,

            intentos: APPOINTMENT_MAX_RETRIES,
          },
        );

        throw error;
      }
    }
  }

  throw new Error(
    `No se pudo actualizar la reserva ${appointment.id}.`,
  );
}

/* =========================================================
   GET
   LISTA DE MENTEES DESDE MICROSOFT BOOKINGS

   La relación con profiles se resuelve por correo.
========================================================= */

export async function GET(request: NextRequest) {
  try {
    await requireCoordinator(request);

    const businessId = getBookingBusinessId();

    const [business, customersResponse] = await Promise.all([
      graphRequest<GraphBookingBusiness>(
        `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}`,
      ),

      graphRequest<{
        value?: GraphBookingCustomer[];
      }>(
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
      (profiles ?? []).map((profile) => [
        normalizeEmail(profile.email),
        profile,
      ]),
    );

    const mentees = (customersResponse.value ?? []).map((customer) => {
      const customerEmail = normalizeEmail(customer.emailAddress);

      const profile = profilesByEmail.get(customerEmail);

      return {
        id: customer.id,

        customerId: customer.id,

        businessId: business.id,

        businessName: business.displayName,

        name: customer.displayName,

        email: customerEmail,

        profileId: profile?.id ?? null,

        nombres: profile?.nombres ?? customer.displayName ?? "",

        apellidos: profile?.apellidos ?? "",

        telefono: profile?.telefono ?? customer.phones?.[0]?.number ?? "",

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
   CREA CUENTA DE MENTEE + CUSTOMER EN BOOKINGS
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

    /* =====================================================
       1. CREAR USUARIO EN SUPABASE AUTH
    ===================================================== */

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

    /* =====================================================
       2. ACTUALIZAR PROFILES
    ===================================================== */

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

    if (profileError) {
      throw profileError;
    }

    /* =====================================================
       3. CREAR CUSTOMER EN MICROSOFT BOOKINGS
    ===================================================== */

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

    console.log("[mentee-create] Customer creado en Microsoft:", {
      customerId: customer.id,

      displayName: customer.displayName,

      emailAddress: customer.emailAddress,
    });

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
      {
        status: 201,
      },
    );
  } catch (error) {
    /* =====================================================
       ROLLBACK CUSTOMER
    ===================================================== */

    if (customerId) {
      try {
        const businessId = getBookingBusinessId();

        await graphRequest(
          `/solutions/bookingBusinesses/${encodeURIComponent(
            businessId,
          )}/customers/${encodeURIComponent(customerId)}`,
          {
            method: "DELETE",
          },
        );
      } catch (rollbackError) {
        console.error(
          "No se pudo revertir el customer de Bookings",
          rollbackError,
        );
      }
    }

    /* =====================================================
       ROLLBACK USUARIO
    ===================================================== */

    if (userId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (rollbackError) {
        console.error(
          "No se pudo revertir el usuario de Supabase",
          rollbackError,
        );
      }
    }

    return handleError(error);
  }
}

/* =========================================================
   PUT
   EDITA MENTEE COMPLETO

   Optimización:

   - Si cambia nombre, correo o teléfono:
       Microsoft Customer
           ↓
       Reservas del mentee seleccionado
           ↓
       Supabase

   - Si solo cambia especialidad, foto, resumen o activo:
       No se toca Microsoft.
       Solo se actualiza Supabase.

   Las reservas del mentee se actualizan con
   concurrencia limitada para evitar "Too Many Requests".
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
        {
          error: "Customer ID, nombres y correo son obligatorios.",
        },
        {
          status: 400,
        },
      );
    }

    const businessId = getBookingBusinessId();

    const nuevoNombre = [nombres, apellidos].filter(Boolean).join(" ");

    const correlationId = crypto.randomUUID();

    console.log("[mentee-update] Datos recibidos:", {
      customerId,
      profileId,
      businessId,
      nuevoNombre,
      email,
      telefono,
      correlationId,
    });

    /* =====================================================
       1. OBTENER CUSTOMER ACTUAL

       Necesitamos conocer los datos actuales de Microsoft
       para saber si realmente debemos actualizar Microsoft.
    ===================================================== */

    console.log("[mentee-update] Buscando customer actual en Microsoft...");

    const customersActuales = await graphRequest<{
      value?: GraphBookingCustomer[];
    }>(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/customers`,
      undefined,
      {
        correlationId,
      },
    );

    const customerActual = (customersActuales.value ?? []).find(
      (customer) => customer.id === customerId,
    );

    if (!customerActual) {
      throw new Error(
        "No se encontró el mentee en Microsoft Bookings antes de actualizarlo.",
      );
    }

    const oldEmail = normalizeEmail(customerActual.emailAddress);

    const oldName = customerActual.displayName ?? "";

    const oldPhone = customerActual.phones?.[0]?.number?.trim() ?? "";

    console.log("[mentee-update] Customer actual:", {
      id: customerActual.id,

      displayName: oldName,

      emailAddress: oldEmail,

      phone: oldPhone,
    });

    /* =====================================================
       2. DETERMINAR SI MICROSOFT REALMENTE CAMBIÓ

       Estos son los únicos campos que necesitan
       sincronización con Microsoft Bookings.
    ===================================================== */

    const cambioCustomer =
      oldName !== nuevoNombre ||
      oldEmail !== email ||
      oldPhone !== telefono;

    console.log("[mentee-update] ¿Hay cambios en Microsoft?", {
      cambioCustomer,

      nombreCambio: oldName !== nuevoNombre,

      emailCambio: oldEmail !== email,

      telefonoCambio: oldPhone !== telefono,
    });

    let appointmentsFound = 0;

    let appointmentsUpdated = 0;

    const appointmentErrors: Array<{
      appointmentId: string;
      error: string;
    }> = [];

    /* =====================================================
       3. MICROSOFT BOOKINGS

       Solo entramos aquí si cambió:
       - nombre
       - correo
       - teléfono
    ===================================================== */

    if (cambioCustomer) {
      /* ===================================================
         3.1 BUSCAR RESERVAS DEL MENTEE

         Se hace ANTES de cambiar el correo porque algunas
         reservas pueden contener el correo anterior.
      =================================================== */

      console.log("[mentee-update] Buscando reservas del mentee...");

      const appointmentsResponse = await graphRequest<{
        value?: GraphBookingAppointment[];
      }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/appointments`,
        undefined,
        {
          correlationId,
        },
      );

      const appointments = (appointmentsResponse.value ?? []).filter(
        (appointment) =>
          appointmentBelongsToCustomer(
            appointment,
            customerId,
            oldEmail,
            email,
          ),
      );

      appointmentsFound = appointments.length;

      console.log("[mentee-update] Reservas encontradas:", {
        cantidad: appointments.length,

        appointmentIds: appointments.map((appointment) => appointment.id),
      });

      /* ===================================================
         3.2 ACTUALIZAR CUSTOMER EN MICROSOFT
      =================================================== */

      const datosMicrosoft = buildCustomerPayload(
        nombres,
        apellidos,
        email,
        telefono,
      );

      console.log("[mentee-update] Actualizando Microsoft Bookings...");

      console.log("[mentee-update] Enviando a Microsoft:", datosMicrosoft);

      await graphRequest(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/customers/${encodeURIComponent(customerId)}`,
        {
          method: "PATCH",

          body: JSON.stringify(datosMicrosoft),
        },
        {
          correlationId,
        },
      );

      console.log(
        "[mentee-update] PATCH de Microsoft ejecutado correctamente.",
      );

      /* ===================================================
         3.3 ACTUALIZAR RESERVAS CON CONCURRENCIA LIMITADA

         No enviamos las 10 reservas simultáneamente.

         Ejemplo con 10 reservas:

           Reserva 1 ─┐
           Reserva 2 ─┤ → Microsoft
           Reserva 3 ─┘

           esperar

           Reserva 4 ─┐
           Reserva 5 ─┤ → Microsoft
           Reserva 6 ─┘

           esperar

           Reserva 7 ─┐
           Reserva 8 ─┤ → Microsoft
           Reserva 9 ─┘

           esperar

           Reserva 10 → Microsoft

         Si Microsoft responde "Too Many Requests",
         la reserva vuelve a intentarse automáticamente.
      =================================================== */

      console.log(
        "[mentee-update] Iniciando sincronización de reservas:",
        {
          cantidad: appointments.length,

          concurrenciaMaxima: APPOINTMENT_BATCH_SIZE,

          maxReintentos: APPOINTMENT_MAX_RETRIES,
        },
      );

      for (
        let index = 0;
        index < appointments.length;
        index += APPOINTMENT_BATCH_SIZE
      ) {
        const batch = appointments.slice(
          index,
          index + APPOINTMENT_BATCH_SIZE,
        );

        const batchNumber =
          Math.floor(index / APPOINTMENT_BATCH_SIZE) + 1;

        const totalBatches = Math.ceil(
          appointments.length / APPOINTMENT_BATCH_SIZE,
        );

        console.log("[mentee-update] Procesando grupo de reservas:", {
          grupo: `${batchNumber}/${totalBatches}`,

          cantidad: batch.length,

          appointmentIds: batch.map(
            (appointment) => appointment.id,
          ),
        });

        const results = await Promise.allSettled(
          batch.map((appointment) =>
            actualizarReservaConReintento(
              appointment,
              businessId,
              customerId,
              oldEmail,
              nuevoNombre,
              email,
              telefono,
              correlationId,
            ),
          ),
        );

        for (let batchIndex = 0; batchIndex < results.length; batchIndex++) {
          const result = results[batchIndex];

          const appointment = batch[batchIndex];

          if (result.status === "fulfilled") {
            appointmentsUpdated++;

            console.log(
              "[mentee-update] Reserva sincronizada:",
              appointment.id,
            );
          } else {
            const message =
              result.reason instanceof Error
                ? result.reason.message
                : "Error desconocido";

            console.error(
              "[mentee-update] Error definitivo actualizando reserva:",
              {
                appointmentId: appointment.id,

                error: message,
              },
            );

            appointmentErrors.push({
              appointmentId: appointment.id,

              error: message,
            });
          }
        }

        console.log("[mentee-update] Grupo finalizado:", {
          grupo: `${batchNumber}/${totalBatches}`,

          actualizadasEnEsteGrupo: results.filter(
            (result) => result.status === "fulfilled",
          ).length,

          erroresEnEsteGrupo: results.filter(
            (result) => result.status === "rejected",
          ).length,

          totalActualizadas: appointmentsUpdated,

          totalErrores: appointmentErrors.length,
        });
      }

      /* ===================================================
         3.4 VERIFICAR CUSTOMER EN MICROSOFT
      =================================================== */

      console.log(
        "[mentee-update] Verificando customer en Microsoft Bookings...",
      );

      const customersVerificacion = await graphRequest<{
        value?: GraphBookingCustomer[];
      }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/customers`,
        undefined,
        {
          correlationId,
        },
      );

      const customerVerificado = (customersVerificacion.value ?? []).find(
        (customer) => customer.id === customerId,
      );

      if (!customerVerificado) {
        throw new Error(
          "Microsoft Bookings confirmó el PATCH, pero no se encontró el customer al verificar la colección.",
        );
      }

      console.log("[mentee-update] Datos de Bookings después del PATCH:", {
        id: customerVerificado.id,

        displayName: customerVerificado.displayName,

        emailAddress: customerVerificado.emailAddress,

        phones: customerVerificado.phones,
      });

      if (customerVerificado.displayName !== nuevoNombre) {
        console.error(
          "[mentee-update] Microsoft no devolvió el nombre esperado.",
          {
            esperado: nuevoNombre,

            recibido: customerVerificado.displayName,
          },
        );

        throw new Error(
          `Microsoft Bookings no confirmó el nuevo nombre del mentee. Esperado: "${nuevoNombre}", recibido: "${customerVerificado.displayName}".`,
        );
      }

      if (normalizeEmail(customerVerificado.emailAddress) !== email) {
        throw new Error(
          `Microsoft Bookings no confirmó el nuevo correo del mentee. Esperado: "${email}", recibido: "${customerVerificado.emailAddress}".`,
        );
      }

      console.log(
        "[mentee-update] Microsoft confirmó correctamente el customer.",
      );

      /* ===================================================
         3.5 VERIFICAR RESERVAS
      =================================================== */

      if (appointmentErrors.length > 0) {
        console.error(
          "[mentee-update] Algunas reservas no pudieron actualizarse:",
          appointmentErrors,
        );

        throw new Error(
          `El mentee se actualizó en Microsoft, pero ${appointmentErrors.length} reserva(s) no pudieron actualizarse.`,
        );
      }

      if (
        appointments.length > 0 &&
        appointmentsUpdated !== appointments.length
      ) {
        throw new Error(
          `No se actualizaron todas las reservas del mentee. Esperadas: ${appointments.length}, actualizadas: ${appointmentsUpdated}.`,
        );
      }

      console.log("[mentee-update] Reservas sincronizadas:", {
        encontradas: appointments.length,

        actualizadas: appointmentsUpdated,
      });
    } else {
      /* ===================================================
         NO HAY CAMBIOS EN MICROSOFT

         Si solamente se modificó:
         - especialidad
         - foto
         - resumen
         - activo

         no necesitamos tocar Microsoft ni sus reservas.
      =================================================== */

      console.log(
        "[mentee-update] Nombre, correo y teléfono no cambiaron.",
      );

      console.log(
        "[mentee-update] Se omite actualización de Microsoft y reservas.",
      );
    }

    /* =====================================================
       4. SUPABASE AUTH
    ===================================================== */

    if (profileId) {
      console.log("[mentee-update] Actualizando Supabase Auth...");

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

      console.log("[mentee-update] Supabase Auth actualizado.");

      /* ===================================================
         5. PROFILES
      =================================================== */

      console.log("[mentee-update] Actualizando profiles...");

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

          /*
              Los mentees son customers,
              no staffMembers.
            */
          microsoft_staff_id: null,

          microsoft_email: email,
        })
        .eq("id", profileId);

      if (profileError) {
        throw profileError;
      }

      console.log("[mentee-update] profiles actualizado.");
    }

    /* =====================================================
       RESPUESTA
    ===================================================== */

    return NextResponse.json({
      message: cambioCustomer
        ? "Mentee y reservas actualizados correctamente."
        : "Mentee actualizado correctamente.",

      mentee: {
        id: customerId,

        customerId,

        profileId: profileId ?? null,

        name: nuevoNombre,

        nombres,

        apellidos,

        email,

        telefono,

        especialidad,

        foto_url,

        resumen,

        activo,
      },

      synchronization: {
        previousName: oldName,

        previousEmail: oldEmail,

        previousPhone: oldPhone,

        newName: nuevoNombre,

        newEmail: email,

        newPhone: telefono,

        customerChanged: cambioCustomer,

        appointmentsFound,

        appointmentsUpdated,
      },
    });
  } catch (error) {
    console.error("[mentee-update] Error:", error);

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
        {
          error: "El customerId es obligatorio.",
        },
        {
          status: 400,
        },
      );
    }

    /*
      Si ya tiene una relación de mentoría,
      se conserva el historial.
      Debe desactivarse mediante PUT.
    */

    if (profileId) {
      const { count, error: pairError } = await supabaseAdmin
        .from("mentoring_pairs")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("mentee_id", profileId);

      if (pairError) {
        throw pairError;
      }

      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Este mentee ya tiene relaciones de mentoría registradas. No puede eliminarse; debe desactivarse.",
          },
          {
            status: 409,
          },
        );
      }
    }

    /* =====================================================
       1. ELIMINAR CUSTOMER DE MICROSOFT BOOKINGS
    ===================================================== */

    const businessId = getBookingBusinessId();

    await graphRequest(
      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId,
      )}/customers/${encodeURIComponent(customerId)}`,
      {
        method: "DELETE",
      },
    );

    /* =====================================================
       2. ELIMINAR SUPABASE AUTH
    ===================================================== */

    if (profileId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(profileId);

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({
      message: "Mentee eliminado correctamente.",
    });
  } catch (error) {
    return handleError(error);
  }
}