
export type MentoriaMailData = {
  mentorNombre: string;
  menteeNombre: string;
  menteeEmail: string;
  fecha: string;
  hora: string;
};

export type MentoriaMailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type MentoriaMailKind =
  | "solicitud-mentor"
  | "solicitud-mentee"
  | "confirmacion-mentee";

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function details(
  rows: Array<[string, string]>,
): string {
  return `
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      style="
        background:#f8f9fa;
        border:1px solid #eceef0;
        border-radius:8px;
        margin:0 0 24px;
        padding:12px 16px;
      "
    >
      ${rows
        .map(
          ([key, value]) => `
            <tr>
              <td style="
                padding:9px 0;
                color:#6b7280;
                font-size:13px;
                vertical-align:top;
                width:34%;
              ">
                ${escapeHtml(key)}
              </td>

              <td style="
                padding:9px 0;
                color:#222222;
                font-size:14px;
                font-weight:bold;
                overflow-wrap:anywhere;
              ">
                ${escapeHtml(value)}
              </td>
            </tr>
          `,
        )
        .join("")}
    </table>
  `;
}

function layout(
  title: string,
  name: string,
  description: string,
  rows: Array<[string, string]>,
  closing: string,
): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>${escapeHtml(title)}</title>
</head>

<body style="
  margin:0;
  padding:0;
  background-color:#f4f5f7;
  font-family:Arial,Helvetica,sans-serif;
">
  <table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    style="
      background-color:#f4f5f7;
      padding:40px 16px;
    "
  >
    <tr>
      <td align="center">

        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          style="
            max-width:560px;
            background-color:#ffffff;
            border-radius:12px;
            overflow:hidden;
          "
        >

          <!-- ENCABEZADO -->
          <tr>
            <td
              align="center"
              style="
                background-color:#87151B;
                padding:34px 24px;
              "
            >
              <h1 style="
                margin:0;
                color:#ffffff;
                font-size:26px;
                font-weight:700;
              ">
                ProUni Mentorías
              </h1>

              <p style="
                margin:10px 0 0;
                color:#f8e9e9;
                font-size:13px;
              ">
                Programa de mentorías
              </p>
            </td>
          </tr>

          <!-- CONTENIDO -->
          <tr>
            <td style="padding:36px 32px;">

              <h2 style="
                margin:0 0 22px;
                color:#222222;
                font-size:22px;
              ">
                ${escapeHtml(title)}
              </h2>

              <p style="
                font-size:15px;
                line-height:1.7;
                color:#444444;
                margin:0 0 18px;
              ">
                Estimado(a) ${escapeHtml(name)}:
              </p>

              <p style="
                font-size:15px;
                line-height:1.7;
                color:#444444;
                margin:0 0 22px;
              ">
                ${escapeHtml(description)}
              </p>

              ${details(rows)}

              <p style="
                font-size:14px;
                line-height:1.7;
                color:#444444;
                margin:0 0 28px;
              ">
                ${escapeHtml(closing)}
              </p>

              <p style="
                font-size:14px;
                line-height:1.7;
                color:#444444;
                margin:0;
              ">
                Atentamente,<br>
                <strong>Equipo ProUni Mentorías</strong>
              </p>

            </td>
          </tr>

          <!-- PIE DE PÁGINA -->
          <tr>
            <td
              align="center"
              style="
                padding:24px;
                background-color:#fafafa;
                border-top:1px solid #eeeeee;
              "
            >
              <p style="
                margin:0;
                color:#888888;
                font-size:12px;
                line-height:1.7;
              ">
                Este es un mensaje automático
                de ProUni Mentorías.<br>
                Por favor, no respondas
                a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export function crearCorreoMentoria(
  kind: MentoriaMailKind,
  data: MentoriaMailData,
): MentoriaMailTemplate {
  const common: Array<[string, string]> = [
    ["Fecha", data.fecha],
    ["Hora", data.hora],
    ["Modalidad", "Virtual"],
  ];

  let title: string;
  let recipient: string;
  let description: string;
  let rows: Array<[string, string]>;
  let closing: string;

  switch (kind) {
    case "solicitud-mentor":
      title = "Nueva solicitud de mentoría";
      recipient = data.mentorNombre;

      description =
        "Se ha registrado una nueva solicitud de mentoría en la plataforma ProUni Mentorías.";

      rows = [
        ["Mentee", data.menteeNombre],
        ["Correo", data.menteeEmail],
        ...common,
        ["Estado", "Pendiente de confirmación"],
      ];

      closing =
        "Puedes revisar los detalles de esta solicitud en la plataforma.";
      break;

    case "solicitud-mentee":
      title = "Solicitud de mentoría registrada";
      recipient = data.menteeNombre;

      description =
        "Tu solicitud de mentoría ha sido registrada correctamente y se encuentra pendiente de confirmación por parte del mentor.";

      rows = [
        ["Mentor", data.mentorNombre],
        ...common,
        ["Estado", "Pendiente de confirmación"],
      ];

      closing =
        "Te informaremos cuando tu mentor confirme la sesión.";
      break;

    case "confirmacion-mentee":
      title = "Tu mentoría ha sido confirmada";
      recipient = data.menteeNombre;

      description =
        "Tu mentor ha confirmado la sesión de mentoría solicitada.";

      rows = [
        ["Mentor", data.mentorNombre],
        ...common,
        ["Estado", "Confirmada"],
      ];

      closing =
        "Te recomendamos estar disponible puntualmente en la fecha y hora programadas.";
      break;
  }

  return {
    subject: `ProUni | ${title}`,

    html: layout(
      title,
      recipient,
      description,
      rows,
      closing,
    ),

    text: [
      `Estimado(a) ${recipient}:`,
      "",
      description,
      "",
      ...rows.map(
        ([key, value]) => `${key}: ${value}`,
      ),
      "",
      closing,
      "",
      "Equipo ProUni Mentorías",
    ].join("\n"),
  };
}
