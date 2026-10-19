
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

export const runtime = "nodejs";

const PAGE_SIZE = 20;
const GRAPH_CONCURRENCY = 4;
const BUCKET_NAME = "bucket";

type PageRow = {
  booking_id: string;
  ultima_evidencia: string;
  total_evidencias: number;
};

type Agreement = {
  id: string;
  microsoft_booking_id: string;
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
  serviceName?: string;
  staffMemberIds?: string[];
  customers?: Array<{
    name?: string;
    emailAddress?: string;
  }>;
  startDateTime?: {
    dateTime: string;
    timeZone?: string;
  };
};

type MenteeProfile = {
  email: string | null;
  foto_url: string | null;
};

type RepositoryItem = {
  mentorship: {
    id: string;
    serviceName?: string;
    menteeName?: string;
    menteeEmail?: string;
    menteeFotoUrl?: string | null;
    startDateTime?: {
      dateTime: string;
    };
  };
  evidencias: Evidence[];
};

function errorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: message },
    { status },
  );
}

function normalizeEmail(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function validPhotoUrl(value?: string | null) {
  if (!value?.trim()) return null;

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

export async function GET(request: NextRequest) {
  try {
    /* ============================================
       1. AUTENTICACIÓN Y AUTORIZACIÓN
    ============================================ */

    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return errorResponse("No autenticado.", 401);
    }

    const token = authorization.slice(7).trim();

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return errorResponse("Sesión no válida.", 401);
    }

    const {
      data: mentor,
      error: mentorError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id, rol, activo, microsoft_staff_id")
      .eq("id", user.id)
      .single();

    if (
      mentorError ||
      !mentor ||
      mentor.rol !== "mentor" ||
      mentor.activo !== true ||
      !mentor.microsoft_staff_id
    ) {
      return errorResponse("Acceso no autorizado.", 403);
    }

    /* ============================================
       2. PAGINACIÓN
    ============================================ */

    const params = request.nextUrl.searchParams;

    const offset = Number(
      params.get("offset") ?? "0",
    );

    const limit = Number(
      params.get("limit") ?? "20",
    );

    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > PAGE_SIZE
    ) {
      return errorResponse(
        "Parámetros de paginación inválidos.",
        400,
      );
    }

    /* ============================================
       3. CITAS CON EVIDENCIAS
    ============================================ */

    const {
      data: rows,
      error: pageError,
    } = await supabaseAdmin.rpc(
      "obtener_mentorias_con_evidencias",
      {
        p_mentor_id: user.id,
        p_limit: limit + 1,
        p_offset: offset,
      },
    );

    if (pageError) {
      console.error(
        "[Repositorio] Error en consulta paginada:",
        pageError,
      );

      return errorResponse(
        "No se pudieron consultar las mentorías.",
        500,
      );
    }

    const candidates = (rows ?? []) as PageRow[];

    const hasMore = candidates.length > limit;
    const page = candidates.slice(0, limit);

    if (!page.length) {
      return NextResponse.json({
        items: [],
        hasMore: false,
        nextOffset: null,
      });
    }

    const bookingIds = page.map(
      (row) => row.booking_id,
    );

    /* ============================================
       4. ACUERDOS DEL MENTOR
    ============================================ */

    const {
      data: agreementsData,
      error: agreementsError,
    } = await supabaseAdmin
      .from("acuerdos")
      .select("id, microsoft_booking_id")
      .eq("creado_por", user.id)
      .in("microsoft_booking_id", bookingIds);

    if (agreementsError) {
      throw new Error(agreementsError.message);
    }

    const agreements =
      (agreementsData ?? []) as Agreement[];

    const agreementIds = agreements.map(
      (agreement) => agreement.id,
    );

    if (!agreementIds.length) {
      return NextResponse.json({
        items: [],
        hasMore,
        nextOffset: hasMore
          ? offset + page.length
          : null,
      });
    }

    /* ============================================
       5. EVIDENCIAS
    ============================================ */

    const {
      data: evidencesData,
      error: evidencesError,
    } = await supabaseAdmin
      .from("evidencias")
      .select(
        "id, acuerdo_id, nombre_archivo, ruta_archivo, tipo_archivo, tamano, created_at",
      )
      .in("acuerdo_id", agreementIds)
      .order("created_at", {
        ascending: false,
      })
      .limit(1000);

    if (evidencesError) {
      throw new Error(evidencesError.message);
    }

    const evidenceByBooking =
      new Map<string, Evidence[]>();

    const bookingByAgreement = new Map(
      agreements.map((agreement) => [
        agreement.id,
        agreement.microsoft_booking_id,
      ]),
    );

    for (
      const evidence of
      (evidencesData ?? []) as Evidence[]
    ) {
      const bookingId = bookingByAgreement.get(
        evidence.acuerdo_id,
      );

      if (!bookingId) continue;

      const { data: urlData } =
        supabaseAdmin.storage
          .from(BUCKET_NAME)
          .getPublicUrl(evidence.ruta_archivo);

      const current =
        evidenceByBooking.get(bookingId) ?? [];

      current.push({
        ...evidence,
        url: urlData.publicUrl,
      });

      evidenceByBooking.set(bookingId, current);
    }

    /* ============================================
       6. VALIDACIÓN CON MICROSOFT BOOKINGS
    ============================================ */

    const businessId = getBookingBusinessId();

    const items: RepositoryItem[] = [];

    for (
      let i = 0;
      i < bookingIds.length;
      i += GRAPH_CONCURRENCY
    ) {
      const group = bookingIds.slice(
        i,
        i + GRAPH_CONCURRENCY,
      );

      const groupResults = await Promise.all(
        group.map(async (bookingId) => {
          try {
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
                mentor.microsoft_staff_id,
              )
            ) {
              return null;
            }

            const evidencias =
              evidenceByBooking.get(bookingId) ?? [];

            if (!evidencias.length) {
              return null;
            }

            const mentee =
              appointment.customers?.[0];

            const result: RepositoryItem = {
              mentorship: {
                id: bookingId,
                serviceName: appointment.serviceName,
                menteeName: mentee?.name,
                menteeEmail: mentee?.emailAddress,
                menteeFotoUrl: null,
                startDateTime: appointment.startDateTime
                  ? {
                      dateTime:
                        appointment.startDateTime.dateTime,
                    }
                  : undefined,
              },
              evidencias,
            };

            return result;
          } catch (error) {
            console.error(
              "[Repositorio] Error consultando cita:",
              bookingId,
              error,
            );

            return null;
          }
        }),
      );

      for (const result of groupResults) {
        if (result) {
          items.push(result);
        }
      }
    }

    /* ============================================
       7. FOTOGRAFÍAS DESDE SUPABASE

       Una consulta adicional para todos los
       mentees de esta página, no una por tarjeta.
    ============================================ */

    const menteeEmails = [
      ...new Set(
        items
          .map((item) =>
            normalizeEmail(item.mentorship.menteeEmail),
          )
          .filter(Boolean),
      ),
    ];

    if (menteeEmails.length > 0) {
      const {
        data: profiles,
        error: profilesError,
      } = await supabaseAdmin
        .from("profiles")
        .select("email, foto_url")
        .eq("rol", "mentee")
        .in("email", menteeEmails);

      if (profilesError) {
        // Las evidencias deben seguir visibles aunque
        // no se puedan recuperar las fotografías.
        console.error(
          "[Repositorio] Error consultando fotos:",
          profilesError,
        );
      } else {
        const photoByEmail = new Map<
          string,
          string | null
        >();

        for (
          const profile of
          (profiles ?? []) as MenteeProfile[]
        ) {
          photoByEmail.set(
            normalizeEmail(profile.email),
            validPhotoUrl(profile.foto_url),
          );
        }

        for (const item of items) {
          const email = normalizeEmail(
            item.mentorship.menteeEmail,
          );

          item.mentorship.menteeFotoUrl =
            photoByEmail.get(email) ?? null;
        }
      }
    }

    /* ============================================
       8. ORDENAR RESULTADOS
    ============================================ */

    items.sort((a, b) => {
      const dateA = new Date(
        a.evidencias[0].created_at,
      ).getTime();

      const dateB = new Date(
        b.evidencias[0].created_at,
      ).getTime();

      return dateB - dateA;
    });

    return NextResponse.json({
      items,
      hasMore,
      nextOffset: hasMore
        ? offset + page.length
        : null,
    });
  } catch (error) {
    console.error(
      "[Repositorio] Error general:",
      error,
    );

    return errorResponse(
      "No se pudo cargar el repositorio.",
      500,
    );
  }
}
