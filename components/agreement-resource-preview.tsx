
"use client";

import { useState } from "react";
import styles from "./agreement-resource-preview.module.css";

type Props = {
  url: string;
  onRemove?: () => void;
};

function getYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    let videoId: string | null = null;

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v");
      } else {
        const parts = parsed.pathname
          .split("/")
          .filter(Boolean);

        if (
          ["shorts", "embed", "live"].includes(
            parts[0] ?? "",
          )
        ) {
          videoId = parts[1] ?? null;
        }
      }
    }

    if (host === "youtu.be") {
      videoId =
        parsed.pathname.split("/").filter(Boolean)[0] ??
        null;
    }

    return videoId &&
      /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      ? videoId
      : null;
  } catch {
    return null;
  }
}

export default function AgreementResourcePreview({
  url,
  onRemove,
}: Props) {
  const [imageError, setImageError] = useState(false);

  let hostname = "Enlace externo";
  let isPdf = false;

  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace(/^www\./, "");
    isPdf = parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return null;
  }

  const youtubeId = getYoutubeId(url);
  const typeLabel = youtubeId
    ? "Video de YouTube"
    : isPdf
      ? "Documento PDF"
      : "Recurso web";

  return (
    <article className={styles.card}>
      {youtubeId && !imageError ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.thumbnailLink}
          aria-label="Abrir video de YouTube"
        >
          {/* Imagen externa sin optimización de Next.js */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.thumbnail}
            src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
            alt="Vista previa del video"
            onError={() => setImageError(true)}
          />
          <span className={styles.play} aria-hidden>
            ▶
          </span>
        </a>
      ) : (
        <div className={styles.typeIcon} aria-hidden>
          {isPdf ? "PDF" : youtubeId ? "▶" : "↗"}
        </div>
      )}

      <div className={styles.content}>
        <span className={styles.type}>{typeLabel}</span>
        <span className={styles.domain}>{hostname}</span>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
          title={url}
        >
          Abrir recurso
          <span aria-hidden> ↗</span>
        </a>
      </div>

      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={`Quitar recurso de ${hostname}`}
        >
          Quitar
        </button>
      )}
    </article>
  );
}
