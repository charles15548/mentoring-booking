"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import styles from "./perfil.module.css";

export type PhotoChange = { file: File | null; removeCurrent: boolean };
type Props = {
  isOpen: boolean;
  currentPhotoUrl: string | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (change: PhotoChange) => Promise<void>;
};

export default function ProfilePhotoModal({
  isOpen,
  currentPhotoUrl,
  saving,
  onClose,
  onConfirm,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setPreview(null);
      setRemoveCurrent(false);
      setError("");
    }
  }, [isOpen]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  if (!isOpen) return null;
  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (
      !selected.type.startsWith("image/") ||
      selected.size > 5 * 1024 * 1024
    ) {
      setError("Elige una imagen válida de hasta 5 MB.");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setRemoveCurrent(false);
    setError("");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file && !removeCurrent) {
      setError("Selecciona una foto o elige eliminar la actual.");
      return;
    }
    void onConfirm({ file, removeCurrent });
  }
  const source = preview ?? (!removeCurrent ? currentPhotoUrl : null);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="booking-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2 id="photo-title">Actualizar foto</h2>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <div className={styles.preview}>
            {source ? (
              <img src={source} alt="Vista previa de foto" />
            ) : (
              <span>Sin foto</span>
            )}
          </div>
          <label className={styles.file}>
            Elegir imagen
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={selectFile}
              disabled={saving}
            />
          </label>
          {currentPhotoUrl && !file && (
            <label className={styles.remove}>
              <input
                type="checkbox"
                checked={removeCurrent}
                onChange={(event) => setRemoveCurrent(event.target.checked)}
                disabled={saving}
              />
              Eliminar la foto actual
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className={styles.modalActions}>
            <button
              className={styles.cancel}
              type="button"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving
                ? "Guardando..."
                : removeCurrent
                  ? "Eliminar foto"
                  : "Guardar foto"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
