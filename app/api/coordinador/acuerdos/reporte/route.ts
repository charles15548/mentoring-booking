import { NextRequest } from "next/server";

import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";

import { supabaseAdmin } from "@/lib/supabase-admin";

import {
  getBookingBusinessId,
  graphRequest,
} from "@/lib/microsoft-graph";

import {
  handleError,
  requireCoordinator,
} from "../../gestionMentores/route";

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

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(
    `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "es-PE",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );
}

function formatDateTime(
  value: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "es-PE",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );
}

function personName(
  person:
    | {
        nombres: string | null;
        apellidos: string | null;
        email: string | null;
      }
    | null,
) {
  if (!person) {
    return "Sin asignar";
  }

  return (
    [
      person.nombres,
      person.apellidos,
    ]
      .filter(Boolean)
      .join(" ") ||
    person.email ||
    "Sin nombre"
  );
}

function wrapText(
  text: string,
  maxLength: number,
) {
  const words =
    text.split(/\s+/);

  const lines: string[] = [];

  let currentLine = "";

  for (const word of words) {
    const testLine =
      currentLine.length > 0
        ? `${currentLine} ${word}`
        : word;

    if (
      testLine.length >
      maxLength
    ) {
      if (currentLine) {
        lines.push(currentLine);
      }

      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export async function GET(
  request: NextRequest,
) {
  try {
    await requireCoordinator(request);

    const { searchParams } =
      new URL(request.url);

    const fechaInicial =
      searchParams.get(
        "fechaInicial",
      );

    const fechaFinal =
      searchParams.get(
        "fechaFinal",
      );

    if (
      !fechaInicial ||
      !fechaFinal
    ) {
      return new Response(
        "Debes indicar la fecha inicial y la fecha final.",
        {
          status: 400,
        },
      );
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        fechaInicial,
      ) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        fechaFinal,
      )
    ) {
      return new Response(
        "El formato de fecha no es válido.",
        {
          status: 400,
        },
      );
    }

    if (
      fechaInicial > fechaFinal
    ) {
      return new Response(
        "La fecha inicial no puede ser posterior a la fecha final.",
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       ACUERDOS DEL PERÍODO
    ===================================================== */

    const fechaFinalExclusiva =
      new Date(
        `${fechaFinal}T00:00:00Z`,
      );

    fechaFinalExclusiva.setUTCDate(
      fechaFinalExclusiva.getUTCDate() +
        1,
    );

    const fechaFinalExclusivaString =
      fechaFinalExclusiva.toISOString();

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("acuerdos")
      .select("*")
      .gte(
        "created_at",
        `${fechaInicial}T00:00:00.000Z`,
      )
      .lt(
        "created_at",
        fechaFinalExclusivaString,
      )
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    /* =====================================================
       MENTEES
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
    }> = [];

    if (
      responsableIds.length > 0
    ) {
      const {
        data: profileData,
        error: profileError,
      } = await supabaseAdmin
        .from("profiles")
        .select(
          "id, nombres, apellidos, email",
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
       MENTORES
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

    if (
      staffIds.length > 0
    ) {
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
       CONSTRUIR DATOS DEL REPORTE
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
            appointment
              ?.staffMemberIds?.[0] ??
            null;

          const mentorProfile =
            mentorStaffId
              ? mentorsByStaffId.get(
                  mentorStaffId,
                )
              : null;

          return {
            titulo:
              agreement.titulo ??
              "Sin título",

            descripcion:
              agreement.descripción ??
              "",

            observacion:
              agreement.observación ??
              "",

            mentee:
              personName(
                menteeProfile
                  ? {
                      nombres:
                        menteeProfile.nombres,
                      apellidos:
                        menteeProfile.apellidos,
                      email:
                        menteeProfile.email,
                    }
                  : null,
              ),

            mentor:
              personName(
                mentorProfile
                  ? {
                      nombres:
                        mentorProfile.nombres,
                      apellidos:
                        mentorProfile.apellidos,
                      email:
                        mentorProfile.email,
                    }
                  : null,
              ),

            fechaLimite:
              formatDate(
                agreement.fecha_limite,
              ),

            fechaCreacion:
              formatDateTime(
                agreement.created_at,
              ),

            estado:
              getVisualStatus(
                agreement.estado as AgreementStatus,
                agreement.fecha_limite,
              ).label,
          };
        },
      );

    /* =====================================================
       RESUMEN
    ===================================================== */

    const totalAcuerdos =
      agreements.length;

    const totalTerminados =
      agreements.filter(
        (agreement) =>
          agreement.estado ===
          "Terminado",
      ).length;

    const totalEnProceso =
      agreements.filter(
        (agreement) =>
          agreement.estado ===
          "En proceso",
      ).length;

    const totalDefinidos =
      agreements.filter(
        (agreement) =>
          agreement.estado ===
          "Definido",
      ).length;

    const totalFueraDeFecha =
      agreements.filter(
        (agreement) =>
          agreement.estado ===
          "Fuera de fecha",
      ).length;

    /* =====================================================
       CREAR PDF
    ===================================================== */

    const pdf =
      await PDFDocument.create();

    const regularFont =
      await pdf.embedFont(
        StandardFonts.Helvetica,
      );

    const boldFont =
      await pdf.embedFont(
        StandardFonts.HelveticaBold,
      );

    const pageWidth = 595.28;
    const pageHeight = 841.89;

    const margin = 42;
    const contentWidth =
      pageWidth -
      margin * 2;

    const textColor =
      rgb(
        0.12,
        0.15,
        0.20,
      );

    const mutedColor =
      rgb(
        0.42,
        0.44,
        0.48,
      );

    const accentColor =
      rgb(
        0.35,
        0.08,
        0.16,
      );

    const lightAccent =
      rgb(
        0.96,
        0.93,
        0.94,
      );

    const borderColor =
      rgb(
        0.86,
        0.86,
        0.88,
      );

    const softBackground =
      rgb(
        0.975,
        0.975,
        0.98,
      );

    let page =
      pdf.addPage([
        pageWidth,
        pageHeight,
      ]);

    let y =
      pageHeight - margin;

    function addPage() {
      page =
        pdf.addPage([
          pageWidth,
          pageHeight,
        ]);

      y =
        pageHeight - margin;
    }

    function ensureSpace(
      requiredHeight: number,
    ) {
      if (
        y - requiredHeight <
        margin + 30
      ) {
        addPage();
      }
    }

    function drawLabelValue(
      label: string,
      value: string,
      x: number,
      yPosition: number,
      labelWidth: number,
    ) {
      page.drawText(
        label,
        {
          x,
          y: yPosition,
          size: 8.5,
          font: boldFont,
          color: mutedColor,
        },
      );

      page.drawText(
        value,
        {
          x:
            x +
            labelWidth,
          y: yPosition,
          size: 8.5,
          font: regularFont,
          color: textColor,
        },
      );
    }

    /* =====================================================
       ENCABEZADO INSTITUCIONAL
    ===================================================== */

    page.drawRectangle({
      x: 0,
      y: pageHeight - 92,
      width: pageWidth,
      height: 92,
      color: accentColor,
    });

    page.drawText(
      "MENTORÍA PROUNI",
      {
        x: margin,
        y: pageHeight - 36,
        size: 10,
        font: boldFont,
        color: rgb(
          1,
          1,
          1,
        ),
      },
    );

    page.drawText(
      "REPORTE DE ACUERDOS",
      {
        x: margin,
        y: pageHeight - 61,
        size: 19,
        font: boldFont,
        color: rgb(
          1,
          1,
          1,
        ),
      },
    );

    page.drawText(
      "Seguimiento de compromisos establecidos durante las mentorías",
      {
        x: margin,
        y: pageHeight - 78,
        size: 8.5,
        font: regularFont,
        color: rgb(
          0.94,
          0.92,
          0.93,
        ),
      },
    );

    y =
      pageHeight -
      122;

    /* =====================================================
       INFORMACIÓN DEL REPORTE
    ===================================================== */

    page.drawText(
      "INFORMACIÓN DEL REPORTE",
      {
        x: margin,
        y,
        size: 9,
        font: boldFont,
        color: accentColor,
      },
    );

    y -= 19;

    drawLabelValue(
      "Período:",
      `${formatDate(fechaInicial)} al ${formatDate(fechaFinal)}`,
      margin,
      y,
      55,
    );

    y -= 16;

    drawLabelValue(
      "Generado:",
      formatDateTime(
        new Date().toISOString(),
      ),
      margin,
      y,
      55,
    );

    y -= 16;

    drawLabelValue(
      "Total:",
      `${totalAcuerdos} acuerdo${totalAcuerdos === 1 ? "" : "s"} registrado${totalAcuerdos === 1 ? "" : "s"}`,
      margin,
      y,
      55,
    );

    y -= 24;

    page.drawLine({
      start: {
        x: margin,
        y,
      },
      end: {
        x:
          pageWidth -
          margin,
        y,
      },
      thickness: 1,
      color: borderColor,
    });

    y -= 24;

    /* =====================================================
       RESUMEN EJECUTIVO
    ===================================================== */

    page.drawText(
      "RESUMEN",
      {
        x: margin,
        y,
        size: 9,
        font: boldFont,
        color: accentColor,
      },
    );

    y -= 20;

    const summaryGap = 8;

    const summaryWidth =
      (contentWidth -
        summaryGap * 3) /
      4;

    const summaryItems = [
      {
        label: "Terminados",
        value: totalTerminados,
      },
      {
        label: "En proceso",
        value: totalEnProceso,
      },
      {
        label: "Definidos",
        value: totalDefinidos,
      },
      {
        label: "Fuera de fecha",
        value: totalFueraDeFecha,
      },
    ];

    summaryItems.forEach(
      (item, index) => {
        const x =
          margin +
          index *
            (summaryWidth +
              summaryGap);

        page.drawRectangle({
          x,
          y: y - 43,
          width: summaryWidth,
          height: 43,
          color:
            index === 0
              ? lightAccent
              : softBackground,
          borderColor,
          borderWidth: 0.7,
        });

        page.drawText(
          String(item.value),
          {
            x:
              x + 10,
            y:
              y - 18,
            size: 15,
            font: boldFont,
            color:
              index === 0
                ? accentColor
                : textColor,
          },
        );

        page.drawText(
          item.label,
          {
            x:
              x + 10,
            y:
              y - 33,
            size: 7.5,
            font: regularFont,
            color: mutedColor,
          },
        );
      },
    );

    y -= 68;

    /* =====================================================
       SIN RESULTADOS
    ===================================================== */

    if (
      agreements.length === 0
    ) {
      page.drawRectangle({
        x: margin,
        y: y - 70,
        width: contentWidth,
        height: 70,
        color: softBackground,
        borderColor,
        borderWidth: 0.7,
      });

      page.drawText(
        "No se encontraron acuerdos registrados",
        {
          x: margin + 16,
          y: y - 27,
          size: 10,
          font: boldFont,
          color: textColor,
        },
      );

      page.drawText(
        "No existen acuerdos creados dentro del período seleccionado.",
        {
          x: margin + 16,
          y: y - 45,
          size: 8.5,
          font: regularFont,
          color: mutedColor,
        },
      );

      y -= 90;
    }

    /* =====================================================
       DETALLE DE ACUERDOS
    ===================================================== */

    for (
      let index = 0;
      index <
      agreements.length;
      index++
    ) {
      const agreement =
        agreements[index];

      const titleLines =
        wrapText(
          agreement.titulo,
          82,
        );

      const descriptionLines =
        agreement.descripcion
          ? wrapText(
              agreement.descripcion,
              88,
            )
          : [];

      const observationLines =
        agreement.observacion
          ? wrapText(
              agreement.observacion,
              88,
            )
          : [];

      const estimatedHeight =
        150 +
        titleLines.length * 13 +
        descriptionLines.length *
          12 +
        observationLines.length *
          12;

      ensureSpace(
        Math.min(
          estimatedHeight,
          260,
        ),
      );

      /* ---------------------------------------------------
         ENCABEZADO DEL ACUERDO
      --------------------------------------------------- */

      page.drawRectangle({
        x: margin,
        y: y - 27,
        width: contentWidth,
        height: 27,
        color: lightAccent,
      });

      page.drawText(
        `ACUERDO ${String(index + 1).padStart(2, "0")}`,
        {
          x: margin + 10,
          y: y - 17,
          size: 9,
          font: boldFont,
          color: accentColor,
        },
      );

      y -= 43;

      /* ---------------------------------------------------
         PARTICIPANTES
      --------------------------------------------------- */

      drawLabelValue(
        "Mentee:",
        agreement.mentee,
        margin,
        y,
        48,
      );

      y -= 16;

      drawLabelValue(
        "Mentor:",
        agreement.mentor,
        margin,
        y,
        48,
      );

      y -= 18;

      /* ---------------------------------------------------
         FECHAS
      --------------------------------------------------- */

      const halfWidth =
        contentWidth / 2;

      page.drawText(
        "Fecha de creación",
        {
          x: margin,
          y,
          size: 7.5,
          font: boldFont,
          color: mutedColor,
        },
      );

      page.drawText(
        agreement.fechaCreacion,
        {
          x: margin,
          y: y - 12,
          size: 9,
          font: regularFont,
          color: textColor,
        },
      );

      page.drawText(
        "Fecha límite",
        {
          x:
            margin +
            halfWidth,
          y,
          size: 7.5,
          font: boldFont,
          color: mutedColor,
        },
      );

      page.drawText(
        agreement.fechaLimite,
        {
          x:
            margin +
            halfWidth,
          y: y - 12,
          size: 9,
          font: regularFont,
          color: textColor,
        },
      );

      y -= 31;

      /* ---------------------------------------------------
         ESTADO
      --------------------------------------------------- */

      page.drawText(
        "Estado",
        {
          x: margin,
          y,
          size: 7.5,
          font: boldFont,
          color: mutedColor,
        },
      );

      page.drawRectangle({
        x: margin,
        y: y - 17,
        width:
          agreement.estado.length *
            4.8 +
          18,
        height: 17,
        color:
          agreement.estado ===
          "Terminado"
            ? rgb(
                0.91,
                0.96,
                0.92,
              )
            : agreement.estado ===
              "Fuera de fecha"
            ? rgb(
                0.98,
                0.93,
                0.93,
              )
            : lightAccent,
      });

      page.drawText(
        agreement.estado,
        {
          x: margin + 9,
          y: y - 12,
          size: 7.5,
          font: boldFont,
          color:
            agreement.estado ===
            "Fuera de fecha"
              ? rgb(
                  0.60,
                  0.15,
                  0.15,
                )
              : agreement.estado ===
                "Terminado"
              ? rgb(
                  0.15,
                  0.42,
                  0.23,
                )
              : accentColor,
        },
      );

      y -= 31;

      /* ---------------------------------------------------
         TÍTULO DEL ACUERDO
      --------------------------------------------------- */

      page.drawText(
        "COMPROMISO",
        {
          x: margin,
          y,
          size: 7.5,
          font: boldFont,
          color: accentColor,
        },
      );

      y -= 14;

      for (
        const line of titleLines
      ) {
        ensureSpace(15);

        page.drawText(
          line,
          {
            x:
              margin + 5,
            y,
            size: 9,
            font: boldFont,
            color: textColor,
          },
        );

        y -= 13;
      }

      /* ---------------------------------------------------
         DESCRIPCIÓN
      --------------------------------------------------- */

      if (
        descriptionLines.length >
        0
      ) {
        y -= 5;

        page.drawText(
          "DESCRIPCIÓN",
          {
            x: margin,
            y,
            size: 7.5,
            font: boldFont,
            color: mutedColor,
          },
        );

        y -= 13;

        for (
          const line of descriptionLines
        ) {
          ensureSpace(15);

          page.drawText(
            line,
            {
              x:
                margin + 5,
              y,
              size: 8.5,
              font: regularFont,
              color: textColor,
            },
          );

          y -= 12;
        }
      }

      /* ---------------------------------------------------
         OBSERVACIÓN
      --------------------------------------------------- */

      if (
        observationLines.length >
        0
      ) {
        y -= 5;

        page.drawText(
          "OBSERVACIÓN",
          {
            x: margin,
            y,
            size: 7.5,
            font: boldFont,
            color: mutedColor,
          },
        );

        y -= 13;

        for (
          const line of observationLines
        ) {
          ensureSpace(15);

          page.drawText(
            line,
            {
              x:
                margin + 5,
              y,
              size: 8.5,
              font: regularFont,
              color: textColor,
            },
          );

          y -= 12;
        }
      }

      /* ---------------------------------------------------
         SEPARADOR
      --------------------------------------------------- */

      y -= 12;

      page.drawLine({
        start: {
          x: margin,
          y,
        },
        end: {
          x:
            pageWidth -
            margin,
          y,
        },
        thickness: 0.7,
        color: borderColor,
      });

      y -= 22;
    }

    /* =====================================================
       PIE DE PÁGINA
    ===================================================== */

    const pages =
      pdf.getPages();

    pages.forEach(
      (
        currentPage,
        index,
      ) => {
        currentPage.drawLine({
          start: {
            x: margin,
            y: 34,
          },
          end: {
            x:
              pageWidth -
              margin,
            y: 34,
          },
          thickness: 0.6,
          color: borderColor,
        });

        currentPage.drawText(
          "Mentoría ProUni",
          {
            x: margin,
            y: 21,
            size: 7.5,
            font: boldFont,
            color: mutedColor,
          },
        );

        currentPage.drawText(
          `Página ${index + 1} de ${pages.length}`,
          {
            x:
              pageWidth -
              margin -
              65,
            y: 21,
            size: 7.5,
            font: regularFont,
            color: mutedColor,
          },
        );
      },
    );

    /* =====================================================
       RESPUESTA PDF
    ===================================================== */

    const pdfBytes =
      await pdf.save();

    const filename =
      `reporte-mentorias-${fechaInicial}-al-${fechaFinal}.pdf`;

    const pdfBuffer =
      Buffer.from(pdfBytes);

    return new Response(
      pdfBuffer,
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `attachment; filename="${filename}"`,

          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    return handleError(error);
  }
}