"use client";

type ModalReporteProps = {
  onClose: () => void;
  onDownload: (
    fechaInicial: string,
    fechaFinal: string,
  ) => void;

  // Funcionalidad pendiente de implementación.
  // onSendEmail: (
  //   fechaInicial: string,
  //   fechaFinal: string,
  // ) => void;
};

export default function ModalReporte({
  onClose,
  onDownload,

  // Funcionalidad pendiente de implementación.
  // onSendEmail,
}: ModalReporteProps) {
  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const firstDayOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  )
    .toISOString()
    .slice(0, 10);

  function handleDownload() {
    const fechaInicial = (
      document.getElementById(
        "fecha-inicial-reporte",
      ) as HTMLInputElement
    )?.value;

    const fechaFinal = (
      document.getElementById(
        "fecha-final-reporte",
      ) as HTMLInputElement
    )?.value;

    if (!fechaInicial || !fechaFinal) {
      return;
    }

    if (fechaInicial > fechaFinal) {
      alert(
        "La fecha inicial no puede ser posterior a la fecha final.",
      );
      return;
    }

    onDownload(
      fechaInicial,
      fechaFinal,
    );
  }

  /*
  Funcionalidad pendiente de implementación.

  function handleSendEmail() {
    const fechaInicial = (
      document.getElementById(
        "fecha-inicial-reporte",
      ) as HTMLInputElement
    )?.value;

    const fechaFinal = (
      document.getElementById(
        "fecha-final-reporte",
      ) as HTMLInputElement
    )?.value;

    if (!fechaInicial || !fechaFinal) {
      return;
    }

    if (fechaInicial > fechaFinal) {
      alert(
        "La fecha inicial no puede ser posterior a la fecha final.",
      );
      return;
    }

    onSendEmail(
      fechaInicial,
      fechaFinal,
    );
  }
  */

  return (
    <div
      className="report-modal-overlay"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="report-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        <div className="report-modal-header">
          <div>
            <p className="report-modal-eyebrow">
              REPORTE DE MENTORÍAS
            </p>

            <h2 id="report-modal-title">
              Generar reporte
            </h2>

            <p>
              Selecciona el período que
              deseas consultar.
            </p>
          </div>

          <button
            type="button"
            className="report-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="report-modal-body">
          <div className="report-date-field">
            <label htmlFor="fecha-inicial-reporte">
              Fecha inicial
            </label>

            <input
              id="fecha-inicial-reporte"
              type="date"
              defaultValue={
                firstDayOfMonth
              }
              max={today}
            />
          </div>

          <div className="report-date-field">
            <label htmlFor="fecha-final-reporte">
              Fecha final
            </label>

            <input
              id="fecha-final-reporte"
              type="date"
              defaultValue={today}
              max={today}
            />
          </div>

          <div className="report-action-section">
            <span>
              ¿Qué deseas hacer?
            </span>

            <div className="report-actions">
              <button
                type="button"
                className="report-download-button"
                onClick={
                  handleDownload
                }
              >
                Descargar PDF
              </button>

              {/*
              Funcionalidad pendiente de implementación.

              <button
                type="button"
                className="report-email-button"
                onClick={
                  handleSendEmail
                }
              >
                Enviar correo
              </button>
              */}
            </div>
          </div>
        </div>

        <div className="report-modal-footer">
          <button
            type="button"
            className="report-cancel-button"
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}