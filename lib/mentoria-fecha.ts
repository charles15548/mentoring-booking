
import "server-only";

type GraphDateTime = {
  dateTime: string;
  timeZone?: string;
};

export function fechaHoraMentoria(
  value?: GraphDateTime,
): {
  fecha: string;
  hora: string;
} | null {
  if (!value?.dateTime) {
    return null;
  }

  const raw = value.dateTime.trim();

  const zone = (
    value.timeZone || ""
  ).trim().toLowerCase();

  const localLima = [
    "sa pacific standard time",
    "america/lima",
  ].includes(zone);

  const hasOffset =
    /(?:z|[+-]\d\d:\d\d)$/i.test(raw);

  let date: Date;

  if (hasOffset || zone === "utc") {
    date = new Date(
      hasOffset ? raw : `${raw}Z`,
    );
  } else if (localLima) {
    date = new Date(
      `${raw.slice(0, 19)}-05:00`,
    );
  } else {
    // Evitar notificar con una hora ambigua.
    return null;
  }

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const fecha = new Intl.DateTimeFormat(
    "es-PE",
    {
      timeZone: "America/Lima",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(date);

  const hora = new Intl.DateTimeFormat(
    "es-PE",
    {
      timeZone: "America/Lima",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    },
  ).format(date);

  return {
    fecha,
    hora: `${hora} (hora de Lima)`,
  };
}
