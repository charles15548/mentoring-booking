import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";

import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

import {
  handleError,
  requireCoordinator,
} from "../gestionMentores/route";

type AgreementStatus =
  | "pendiente"
  | "en_progreso"
  | "cumplido"
  | "cancelado";

function getVisualStatus(
  estado: AgreementStatus,
  fechaLimite: string | null,
) {
  if (estado === "cumplido") {
    return {
      key: "terminado",
      label: "Terminado",
    };
  }

  if (fechaLimite) {
    const today = new Date();
    const todayString =
      today.toISOString().slice(0, 10);

    if (fechaLimite < todayString) {
      return {
        key: "fuera_de_fecha",
        label: "Fuera de fecha",
      };
    }
  }

  if (estado === "en_progreso") {
    return {
      key: "en_proceso",
      label: "En proceso",
    };
  }

  return {
    key: "definido",
    label: "Definido",
  };
}

export async function GET(
  request: NextRequest,
) {
  try {
    await requireCoordinator(request);

    /* =====================================================
       ACUERDOS
    ===================================================== */

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("acuerdos")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    /* =====================================================
       MENTEES RESPONSABLES
    ===================================================== */

    const responsableIds = [
      ...new Set(
        (data ?? [])
          .map(
            (agreement) =>
              agreement.responsable_id,
          )
          .filter(Boolean),
      ),
    ];

    let profiles: Array<{
      id: string;
      nombres: string | null;
      apellidos: string | null;
      email: string | null;
      microsoft_staff_id?: string | null;
      rol?: string | null;
    }> = [];

    if (responsableIds.length > 0) {
      const {
        data: profileData,
        error: profileError,
      } = await supabaseAdmin
        .from("profiles")
        .select(
          "id, nombres, apellidos, email, microsoft_staff_id, rol",
        )
        .in(
          "id",
          responsableIds,
        );

      if (profileError) {
        throw profileError;
      }

      profiles =
        profileData ?? [];
    }

    const profilesById =
      new Map(
        profiles.map(
          (profile) => [
            profile.id,
            profile,
          ],
        ),
      );

    /* =====================================================
       MICROSOFT BOOKINGS
    ===================================================== */

    const businessId =
      getBookingBusinessId();

    const appointmentsData =
      await graphRequest<{
        value?: Array<{
          id: string;
          staffMemberIds?: string[];
        }>;
      }>(
        `/solutions/bookingBusinesses/${encodeURIComponent(
          businessId,
        )}/appointments`,
      );

    const appointments =
      appointmentsData.value ?? [];

    const appointmentsById =
      new Map(
        appointments.map(
          (appointment) => [
            appointment.id,
            appointment,
          ],
        ),
      );

    /* =====================================================
       OBTENER MICROSOFT STAFF IDS
    ===================================================== */

    const staffIds = [
      ...new Set(
        appointments.flatMap(
          (appointment) =>
            appointment.staffMemberIds ??
            [],
        ),
      ),
    ];

    let mentorProfiles: Array<{
      id: string;
      nombres: string | null;
      apellidos: string | null;
      email: string | null;
      microsoft_staff_id: string | null;
    }> = [];

    if (staffIds.length > 0) {
      const {
        data: mentorData,
        error: mentorError,
      } = await supabaseAdmin
        .from("profiles")
        .select(
          "id, nombres, apellidos, email, microsoft_staff_id",
        )
        .in(
          "microsoft_staff_id",
          staffIds,
        );

      if (mentorError) {
        throw mentorError;
      }

      mentorProfiles =
        mentorData ?? [];
    }

    const mentorsByStaffId =
      new Map(
        mentorProfiles
          .filter(
            (profile) =>
              profile.microsoft_staff_id,
          )
          .map(
            (profile) => [
              profile.microsoft_staff_id!,
              profile,
            ],
          ),
      );

    /* =====================================================
       CONSTRUIR RESPUESTA
    ===================================================== */

    const agreements =
      (data ?? []).map(
        (agreement) => {
          const menteeProfile =
            agreement.responsable_id
              ? profilesById.get(
                  agreement.responsable_id,
                )
              : null;

          const appointment =
            agreement.microsoft_booking_id
              ? appointmentsById.get(
                  agreement.microsoft_booking_id,
                )
              : null;

          const mentorStaffId =
            appointment?.staffMemberIds?.[0] ??
            null;

          const mentorProfile =
            mentorStaffId
              ? mentorsByStaffId.get(
                  mentorStaffId,
                )
              : null;

          return {
            ...agreement,

            mentee: menteeProfile
              ? {
                  id: menteeProfile.id,
                  nombre:
                    menteeProfile.nombres,
                  apellido:
                    menteeProfile.apellidos,
                  email:
                    menteeProfile.email,
                }
              : null,

            mentor: mentorProfile
              ? {
                  id: mentorProfile.id,
                  nombre:
                    mentorProfile.nombres,
                  apellido:
                    mentorProfile.apellidos,
                  email:
                    mentorProfile.email,
                }
              : null,

            estado_visual:
              getVisualStatus(
                agreement.estado as AgreementStatus,
                agreement.fecha_limite,
              ),
          };
        },
      );

    return NextResponse.json(
      agreements,
      {
        headers: {
          "Cache-Control":
            "private, no-store",
        },
      },
    );
  } catch (error) {
    return handleError(error);
  }
}

