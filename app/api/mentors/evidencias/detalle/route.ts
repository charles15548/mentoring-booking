
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

export const runtime = "nodejs";

const BUCKET_NAME = "bucket";
const BATCH_SIZE = 100;
const PAGE_SIZE = 500;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/* =====================================================
   TIPOS
===================================================== */

type Agreement = {
  id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado:
    | "pendiente"
    | "en_progreso"
    | "cumplido"
    | "cancelado";
  fecha_limite: string | null;
};

type Evidence = {
  id: string;
  acuerdo_id: string;
  nombre_archivo: string;
  ruta_archivo: string;
  tipo_archivo: string | null;
  tamano: number | null;
  created_at: string;
  url?: string;
};

type Appointment = {
  staffMemberIds?: string[];
  customers?: Array<{
    name?: string;
    emailAddress?: string;
  }>;
  serviceName?: string;
  startDateTime?: {
    dateTime: string;
    timeZone?: string;
  };
};

type MenteeProfile = {
  foto_url: string | null;
};

/* =====================================================
   FUNCIONES AUXILIARES
===================================================== */

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: message },
    { status },
  );
}

function getDatabase(token: string) {
  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function validPhotoUrl(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

/* =====================================================
   GET - DETALLE DE EVIDENCIAS DEL MENTOR
===================================================== */

export async function GET(request: NextRequest) {
  try {
    /* ============================================
       1. VALIDAR SESIÓN
    ============================================ */

    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return errorResponse(
        "No hay sesión activa.",
        401,
      );
    }

    const token =
      authorization.slice(7).trim();

    const db = getDatabase(token);

    const {
      data: { user },
      error: userError,
    } = await db.auth.getUser(token);

    if (userError || !user) {
      return errorResponse(
        "La sesión no es válida.",
        401,
      );
    }

    /* ============================================
       2. VALIDAR PERFIL DEL MENTOR
    ============================================ */

    const {
      data: profile,
      error: profileError,
    } = await db
      .from("profiles")
      .select(
        "id, rol, activo, microsoft_staff_id",
      )
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.rol !== "mentor" ||
      profile.activo !== true ||
      !profile.microsoft_staff_id
    ) {
      return errorResponse(
        "No tienes permisos para consultar las evidencias.",
        403,
      );
    }

    /* ============================================
       3. OBTENER BOOKING ID
    ============================================ */

    const bookingId =
      request.nextUrl.searchParams
        .get("bookingId")
        ?.trim();

    if (!bookingId) {
      return errorResponse(
        "El bookingId es obligatorio.",
        400,
      );
    }

    /* ============================================
       4. VALIDAR CITA EN MICROSOFT BOOKINGS
    ============================================ */

    const businessId =
      getBookingBusinessId();

    const appointment =
      await graphRequest<Appointment>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/appointments/${encodeURIComponent(
          bookingId,
        )}`,
      );

    if (
      !appointment.staffMemberIds?.includes(
        profile.microsoft_staff_id,
      )
    ) {
      return errorResponse(
        "No tienes acceso a esta mentoría.",
        403,
      );
    }

    /* ============================================
       5. IDENTIFICAR AL MENTEE
    ============================================ */

    const customers =
      appointment.customers ?? [];

    const primaryCustomer =
      customers[0] ?? null;

    const menteeEmail =
      primaryCustomer?.emailAddress
        ?.trim() || "";

    const menteeName =
      primaryCustomer?.name
        ?.trim() ||
      "Mentee no identificado";

    /* ============================================
       6. CONSULTAR FOTO DEL MENTEE

       Se utiliza la misma relación por correo
       que en el repositorio general.

       Si no existe una foto o falla la consulta,
       el resto de la pantalla continúa funcionando.
    ============================================ */

    let menteeFotoUrl: string | null = null;

    if (menteeEmail) {
      const {
        data: menteeProfile,
        error: photoError,
      } = await supabaseAdmin
        .from("profiles")
        .select("foto_url")
        .eq("rol", "mentee")
        .ilike("email", menteeEmail)
        .maybeSingle();

      if (photoError) {
        console.error(
          "[Detalle evidencias] Error consultando foto:",
          photoError,
        );
      } else {
        const profileData =
          menteeProfile as MenteeProfile | null;

        menteeFotoUrl = validPhotoUrl(
          profileData?.foto_url,
        );
      }
    }

    /* ============================================
       7. CONSTRUIR INFORMACIÓN DEL MENTEE
    ============================================ */

    const mentee = {
      nombre: menteeName,
      email: menteeEmail,
      fotoUrl: menteeFotoUrl,
      participantes: customers.length,
    };

    /* ============================================
       8. OBTENER ACUERDOS DESDE SUPABASE
       RESPETANDO RLS
    ============================================ */

    const agreements: Agreement[] = [];

    let agreementOffset = 0;

    while (true) {
      const {
        data,
        error,
      } = await db
        .from("acuerdos")
        .select(
          "id, titulo, descripcion, observacion, estado, fecha_limite",
        )
        .eq(
          "microsoft_booking_id",
          bookingId,
        )
        .order("id", {
          ascending: true,
        })
        .range(
          agreementOffset,
          agreementOffset + PAGE_SIZE - 1,
        );

      if (error) {
        throw new Error(error.message);
      }

      const batch =
        (data ?? []) as Agreement[];

      agreements.push(...batch);

      if (batch.length < PAGE_SIZE) {
        break;
      }

      agreementOffset += PAGE_SIZE;
    }

    /* ============================================
       9. RESPUESTA SIN ACUERDOS
    ============================================ */

    if (agreements.length === 0) {
      return NextResponse.json({
        mentee,
        totalEvidencias: 0,
        totalAcuerdos: 0,
        items: [],
      });
    }

    /* ============================================
       10. OBTENER EVIDENCIAS EN LOTES
    ============================================ */

    const evidenceByAgreement =
      new Map<string, Evidence[]>();

    for (const agreement of agreements) {
      evidenceByAgreement.set(
        agreement.id,
        [],
      );
    }

    for (
      let index = 0;
      index < agreements.length;
      index += BATCH_SIZE
    ) {
      const agreementIds = agreements
        .slice(index, index + BATCH_SIZE)
        .map((agreement) => agreement.id);

      let evidenceOffset = 0;

      while (true) {
        const {
          data: evidenceData,
          error: evidenceError,
        } = await supabaseAdmin
          .from("evidencias")
          .select(
            "id, acuerdo_id, nombre_archivo, ruta_archivo, tipo_archivo, tamano, created_at",
          )
          .in(
            "acuerdo_id",
            agreementIds,
          )
          .order("id", {
            ascending: true,
          })
          .range(
            evidenceOffset,
            evidenceOffset + PAGE_SIZE - 1,
          );

        if (evidenceError) {
          throw new Error(
            evidenceError.message,
          );
        }

        const batch =
          (evidenceData ?? []) as Evidence[];

        for (const evidence of batch) {
          const current =
            evidenceByAgreement.get(
              evidence.acuerdo_id,
            );

          if (!current) {
            continue;
          }

          const { data: urlData } =
            supabaseAdmin.storage
              .from(BUCKET_NAME)
              .getPublicUrl(
                evidence.ruta_archivo,
              );

          current.push({
            ...evidence,
            url: urlData.publicUrl,
          });
        }

        if (batch.length < PAGE_SIZE) {
          break;
        }

        evidenceOffset += PAGE_SIZE;
      }
    }

    /* ============================================
       11. CONSOLIDAR Y ORDENAR
    ============================================ */

    const items = agreements
      .map((agreement) => {
        const evidencias = [
          ...(
            evidenceByAgreement.get(
              agreement.id,
            ) ?? []
          ),
        ];

        evidencias.sort(
          (first, second) =>
            new Date(
              second.created_at,
            ).getTime() -
            new Date(
              first.created_at,
            ).getTime(),
        );

        return {
          agreement,
          evidencias,
        };
      })
      .filter(
        (item) =>
          item.evidencias.length > 0,
      );

    const totalEvidencias =
      items.reduce(
        (total, item) =>
          total + item.evidencias.length,
        0,
      );

    /* ============================================
       12. RESPUESTA FINAL
    ============================================ */

    return NextResponse.json({
      mentee,
      totalEvidencias,
      totalAcuerdos: items.length,
      items,
    });
  } catch (error) {
    console.error(
      "[Detalle evidencias] Error:",
      error,
    );

    return errorResponse(
      "No se pudo cargar el detalle de evidencias.",
      500,
    );
  }
}
