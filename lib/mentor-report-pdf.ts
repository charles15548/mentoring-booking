import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  PDFDocument,
  PDFImage,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";

type Agreement = {
  id: string;
  titulo: string;
  descripcion: string | null;
  observacion: string | null;
  estado: string;
  fechaLimite: string | null;
};

type ReportData = {
  mentor: {
    id: string;
    nombre: string;
  };
  periodo: {
    desde: string;
    hasta: string;
  };
  totales: {
    totalMentorias: number;
    totalAcuerdos: number;
    cumplidos: number;
    pendientes: number;
    enProgreso: number;
    cancelados: number;
  };
  sesiones: Array<{
    bookingId: string;
    fecha: string | null;
    servicio: string;
    mentee: {
      nombre: string;
      email: string;
      fotoUrl: string | null;
    };
    acuerdos: Agreement[];
  }>;
};

const W = 595.28;
const H = 841.89;
const M = 44;
const CONTENT_W = W - M * 2;
const BOTTOM = 55;

const BRAND = rgb(0.506, 0.067, 0.106);
const TEXT = rgb(0.17, 0.19, 0.22);
const MUTED = rgb(0.4, 0.44, 0.5);
const BORDER = rgb(0.89, 0.9, 0.91);
const PANEL = rgb(0.975, 0.978, 0.981);
const GREEN = rgb(0.14, 0.48, 0.31);
const AMBER = rgb(0.67, 0.43, 0.12);
const BLUE = rgb(0.24, 0.43, 0.73);

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "-");
}

function dateLabel(value: string | null) {
  if (!value) return "Sin fecha";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  });
}

function periodDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function agreementStatus(value: string) {
  const labels: Record<string, string> = {
    cumplido: "Cumplido",
    pendiente: "Pendiente",
    en_progreso: "En progreso",
    cancelado: "Cancelado",
  };

  return labels[value] ?? value;
}

function wrapText(content: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  const words = clean(content).split(" ");
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);

    let remaining = word;

    while (remaining && font.widthOfTextAtSize(remaining, size) > width) {
      let end = 1;

      while (
        end < remaining.length &&
        font.widthOfTextAtSize(remaining.slice(0, end + 1), size) <= width
      ) {
        end++;
      }

      lines.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }

    current = remaining;
  }

  if (current) lines.push(current);

  return lines.length ? lines : [""];
}

/* =====================================================
   FOTOGRAFÍAS CIRCULARES
===================================================== */

async function loadAvatar(
  pdf: PDFDocument,
  photoUrl: string | null,
): Promise<PDFImage | null> {
  if (!photoUrl) return null;

  try {
    const url = new URL(photoUrl);
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);

    if (
      url.protocol !== "https:" ||
      url.origin !== supabaseUrl.origin ||
      !url.pathname.startsWith("/storage/v1/object/")
    ) {
      return null;
    }

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length > 2_000_000) return null;

    const mask = Buffer.from(`
      <svg width="160" height="160">
        <circle
          cx="80"
          cy="80"
          r="77"
          fill="white"
        />
      </svg>
    `);

    const rounded = await sharp(bytes)
      .rotate()
      .resize(160, 160, {
        fit: "cover",
        position: "centre",
      })
      .ensureAlpha()
      .composite([
        {
          input: mask,
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();

    return await pdf.embedPng(rounded);
  } catch (error) {
    console.warn("No se pudo incorporar una fotografía:", error);

    return null;
  }
}

/* =====================================================
   GENERADOR PRINCIPAL
===================================================== */

export async function generarPdfMentoria(
  report: ReportData,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  pdf.setTitle("Reporte de avance de mentorías");
  pdf.setAuthor("Bitácora Mentoring ProUni");
  pdf.setSubject("Seguimiento mensual de mentorías");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await readFile(
    path.join(process.cwd(), "public", "LogoProUni.jpg"),
  );

  const logo = await pdf.embedJpg(logoBytes);

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - 45;

  function nextPage() {
    page = pdf.addPage([W, H]);
    y = H - 48;
  }

  function ensureSpace(height: number) {
    if (y - height < BOTTOM) {
      nextPage();
    }
  }

  function write(
    content: string,
    options: {
      x?: number;
      width?: number;
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      lineHeight?: number;
    } = {},
  ) {
    const font = options.font ?? regular;
    const size = options.size ?? 10;
    const x = options.x ?? M;
    const width = options.width ?? W - M - x;
    const lineHeight = options.lineHeight ?? size * 1.45;

    const lines = wrapText(content, font, size, width);

    for (const line of lines) {
      ensureSpace(lineHeight + 2);

      page.drawText(line, {
        x,
        y,
        size,
        font,
        color: options.color ?? TEXT,
      });

      y -= lineHeight;
    }
  }

  function separator() {
    ensureSpace(15);

    page.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 0.7,
      color: BORDER,
    });

    y -= 16;
  }

  function sectionTitle(title: string) {
    ensureSpace(37);
    y -= 12;

    write(title, {
      font: bold,
      size: 12,
      color: BRAND,
    });

    y -= 5;
  }

  /* ===================================================
     ENCABEZADO CON LOGO PROUNI ORIGINAL
  =================================================== */

  const logoWidth = 111;
  const logoHeight = (logo.height / logo.width) * logoWidth;

  page.drawImage(logo, {
    x: W - M - logoWidth,
    y: H - 49 - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });

  write("BITÁCORA MENTORING PROUNI", {
    font: bold,
    size: 9,
    color: BRAND,
    width: 350,
  });

  y -= 9;

  write("REPORTE DE AVANCE", {
    font: bold,
    size: 19,
    width: 350,
  });

  write("DE MENTORÍAS", {
    font: bold,
    size: 19,
    width: 350,
  });

  y = Math.min(y - 14, H - 76 - logoHeight);

  separator();

  write(`Mentor: ${report.mentor.nombre}`, {
    size: 10,
  });

  write(
    `Período: ${periodDate(
      report.periodo.desde,
    )} al ${periodDate(report.periodo.hasta)}`,
    { size: 10 },
  );

  write(
    `Fecha de emisión: ${new Date().toLocaleString("es-PE", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Lima",
    })}`,
    { size: 9, color: MUTED },
  );

  /* ===================================================
     DASHBOARD EN EL PDF
  =================================================== */

  sectionTitle("1. RESUMEN DEL PERÍODO");

  const gap = 12;
  const cardWidth = (CONTENT_W - gap) / 2;
  const cardHeight = 70;

  const indicators = [
    {
      label: "Mentorías realizadas",
      value: report.totales.totalMentorias,
    },
    {
      label: "Acuerdos registrados",
      value: report.totales.totalAcuerdos,
    },
    {
      label: "Acuerdos cumplidos",
      value: report.totales.cumplidos,
    },
    {
      label: "Acuerdos por cumplir",
      value: report.totales.pendientes + report.totales.enProgreso,
    },
  ];

  ensureSpace(cardHeight * 2 + gap + 14);

  const dashboardTop = y;

  indicators.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);

    const x = M + col * (cardWidth + gap);
    const top = dashboardTop - row * (cardHeight + gap);

    page.drawRectangle({
      x,
      y: top - cardHeight,
      width: cardWidth,
      height: cardHeight,
      color: rgb(1, 1, 1),
      borderColor: BORDER,
      borderWidth: 0.85,
    });

    page.drawText(clean(item.label), {
      x: x + 14,
      y: top - 23,
      font: regular,
      size: 9,
      color: MUTED,
    });

    page.drawText(String(item.value), {
      x: x + 14,
      y: top - 54,
      font: bold,
      size: 23,
      color: TEXT,
    });
  });

  y = dashboardTop - cardHeight * 2 - gap - 18;

  /* ===================================================
     DESGLOSE DE ESTADOS
  =================================================== */

  ensureSpace(97);

  write("Estado de los acuerdos", {
    font: bold,
    size: 10,
  });

  y -= 5;

  const breakdown = [
    {
      label: "Cumplidos",
      count: report.totales.cumplidos,
      color: GREEN,
    },
    {
      label: "Pendientes",
      count: report.totales.pendientes,
      color: AMBER,
    },
    {
      label: "En progreso",
      count: report.totales.enProgreso,
      color: BLUE,
    },
    {
      label: "Cancelados",
      count: report.totales.cancelados,
      color: MUTED,
    },
  ];

  const half = CONTENT_W / 2;
  const breakdownTop = y;

  breakdown.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);

    const x = M + column * half;
    const rowY = breakdownTop - row * 27;

    page.drawCircle({
      x: x + 5,
      y: rowY - 5,
      size: 4,
      color: item.color,
    });

    page.drawText(item.label, {
      x: x + 17,
      y: rowY - 8,
      font: regular,
      size: 9,
      color: MUTED,
    });

    const countText = String(item.count);
    const countWidth = bold.widthOfTextAtSize(countText, 10);

    page.drawText(countText, {
      x: x + half - countWidth - 15,
      y: rowY - 8,
      font: bold,
      size: 10,
      color: TEXT,
    });
  });

  y = breakdownTop - 62;

  /* ===================================================
     DETALLE POR MENTORÍA
  =================================================== */

  sectionTitle("2. DETALLE DE MENTORÍAS");

  for (let index = 0; index < report.sesiones.length; index++) {
    const session = report.sesiones[index];

    ensureSpace(108);
    separator();

    const avatar = await loadAvatar(pdf, session.mentee.fotoUrl);

    const avatarSize = 39;
    const avatarTop = y;

    // Aro exterior suave y fondo blanco.
    page.drawCircle({
      x: M + avatarSize / 2,
      y: avatarTop - avatarSize / 2,
      size: avatarSize / 2 + 3,
      color: rgb(0.96, 0.9, 0.91),
    });

    page.drawCircle({
      x: M + avatarSize / 2,
      y: avatarTop - avatarSize / 2,
      size: avatarSize / 2 + 1,
      color: rgb(1, 1, 1),
    });

    if (avatar) {
      page.drawImage(avatar, {
        x: M,
        y: avatarTop - avatarSize,
        width: avatarSize,
        height: avatarSize,
      });
    } else {
      page.drawCircle({
        x: M + avatarSize / 2,
        y: avatarTop - avatarSize / 2,
        size: avatarSize / 2 - 2,
        color: rgb(0.96, 0.9, 0.91),
      });
    }

    const headerTop = y;

    write(`${index + 1}. ${session.mentee.nombre}`, {
      x: M + 54,
      width: CONTENT_W - 54,
      size: 11,
      font: bold,
    });

    write(`Fecha: ${dateLabel(session.fecha)}`, {
      x: M + 54,
      width: CONTENT_W - 54,
      size: 9,
      color: MUTED,
    });

    y = Math.min(y, headerTop - 53);

    write(`Acuerdos registrados: ${session.acuerdos.length}`, {
      font: bold,
      size: 9,
    });

    y -= 7;

    if (session.acuerdos.length === 0) {
      write("Sin acuerdos registrados.", {
        size: 9,
        color: MUTED,
      });

      y -= 9;
      continue;
    }

    for (
      let agreementIndex = 0;
      agreementIndex < session.acuerdos.length;
      agreementIndex++
    ) {
      const agreement = session.acuerdos[agreementIndex];

      ensureSpace(48);

      write(`${agreementIndex + 1}. ${agreement.titulo}`, {
        font: bold,
        size: 9.5,
      });

      const stateColor =
        agreement.estado === "cumplido"
          ? GREEN
          : agreement.estado === "en_progreso"
            ? BLUE
            : agreement.estado === "pendiente"
              ? AMBER
              : MUTED;

      write(`Estado: ${agreementStatus(agreement.estado)}`, {
        size: 9,
        color: stateColor,
      });

      if (agreement.descripcion) {
        write(agreement.descripcion, {
          size: 8.5,
          color: MUTED,
        });
      }

      y -= 8;
    }

    y -= 9;
  }

  /* ===================================================
     NUMERACIÓN DE PÁGINAS
  =================================================== */

  const pages = pdf.getPages();

  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: M, y: 38 },
      end: { x: W - M, y: 38 },
      thickness: 0.6,
      color: BORDER,
    });

    currentPage.drawText(
      clean(
        `Bitácora Mentoring ProUni | Página ${index + 1} de ${pages.length}`,
      ),
      {
        x: M,
        y: 23,
        font: regular,
        size: 8,
        color: MUTED,
      },
    );
  });

  return pdf.save();
}
