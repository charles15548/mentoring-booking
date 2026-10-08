"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import styles from "./perfil.module.css";

export type PhotoChange = {
  file: File | null;
  removeCurrent: boolean;
};

type Props = {
  isOpen: boolean;
  currentPhotoUrl: string | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (change: PhotoChange) => Promise<void>;
};

type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function createCroppedFile(imageSrc: string, crop: PixelCrop): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");

      const outputSize = 512;

      canvas.width = outputSize;
      canvas.height = outputSize;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("No se pudo preparar la imagen."));
        return;
      }

      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        outputSize,
        outputSize,
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("No se pudo generar la imagen recortada."));
            return;
          }

          const croppedFile = new File([blob], "foto-perfil.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });

          resolve(croppedFile);
        },
        "image/jpeg",
        0.9,
      );
    };

    image.onerror = () => {
      reject(new Error("No se pudo procesar la imagen."));
    };

    image.src = imageSrc;
  });
}

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

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setPreview(null);
      setRemoveCurrent(false);
      setError("");
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
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

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    const imageUrl = URL.createObjectURL(selected);

    setFile(selected);
    setPreview(imageUrl);
    setRemoveCurrent(false);
    setError("");

    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);

    event.target.value = "";
  }

  function handleCropComplete(
    _croppedArea: unknown,
    croppedAreaPixelsValue: PixelCrop,
  ) {
    setCroppedAreaPixels(croppedAreaPixelsValue);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!file && !removeCurrent) {
      setError("Selecciona una foto o elige eliminar la actual.");
      return;
    }

    if (removeCurrent) {
      await onConfirm({
        file: null,
        removeCurrent: true,
      });

      return;
    }

    if (!file || !preview || !croppedAreaPixels) {
      setError("Ajusta la imagen antes de guardarla.");
      return;
    }

    try {
      setError("");

      const croppedFile = await createCroppedFile(preview, croppedAreaPixels);

      await onConfirm({
        file: croppedFile,
        removeCurrent: false,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo procesar la imagen.",
      );
    }
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
          {preview ? (
            <>
              <div className={styles.cropArea}>
                <Cropper
                  image={preview}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onCropComplete={handleCropComplete}
                  onZoomChange={setZoom}
                />
              </div>

              <div className={styles.zoomControl}>
                <span className={styles.zoomLabel}>Ajusta tu foto</span>

                <div className={styles.zoomSlider}>
                  <button
                    type="button"
                    className={styles.zoomButton}
                    onClick={() =>
                      setZoom((current) => Math.max(1, current - 0.1))
                    }
                    disabled={saving || zoom <= 1}
                    aria-label="Alejar imagen"
                  >
                    −
                  </button>

                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                    disabled={saving}
                    aria-label="Ajustar tamaño de la foto"
                  />

                  <button
                    type="button"
                    className={styles.zoomButton}
                    onClick={() =>
                      setZoom((current) => Math.min(3, current + 0.1))
                    }
                    disabled={saving || zoom >= 3}
                    aria-label="Acercar imagen"
                  >
                    +
                  </button>
                </div>
              </div>

              <p className={styles.cropHint}>
                Mueve la imagen y ajusta el tamaño para centrar tu foto.
              </p>

              <label className={styles.changeFile}>
                Cambiar imagen
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={selectFile}
                  disabled={saving}
                />
              </label>
            </>
          ) : (
            <>
              <div className={styles.preview}>
                {source ? (
                  <img src={source} alt="Vista previa de foto" />
                ) : (
                  <span>Sin foto</span>
                )}
              </div>

              <label className={styles.file}>
                <span className={styles.fileTitle}>Elegir imagen</span>

                <span className={styles.fileDescription}>
                  JPG, PNG o WEBP · Máximo 5 MB
                </span>

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={selectFile}
                  disabled={saving}
                />
              </label>
            </>
          )}

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
