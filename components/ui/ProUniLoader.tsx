
import type { ReactNode } from "react";
import styles from "./ProUniLoader.module.css";

export type ProUniLoaderIcon =
  | "calendar"
  | "calendar-clock"
  | "clock"
  | "book"
  | "users"
  | "user"
  | "clipboard"
  | "chart";

type ProUniLoaderProps = {
  title: string;
  description?: string;
  icon?: ProUniLoaderIcon;
  compact?: boolean;
  className?: string;
};

function LoaderIcon({
  name,
}: {
  name: ProUniLoaderIcon;
}): ReactNode {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const iconPaths: Record<
    ProUniLoaderIcon,
    ReactNode
  > = {
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
        <path d="M7 14h3M14 14h3M7 18h3" />
      </>
    ),

    "calendar-clock": (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
        <circle cx="15.5" cy="16" r="3.5" />
        <path d="M15.5 14.4V16l1.1.7" />
        <path d="M7 14h3M7 18h3" />
      </>
    ),

    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),

    book: (
      <>
        <path d="M12 6.5C9 4.8 6 4.8 3 5.5v13c3-.7 6-.7 9 1" />
        <path d="M12 6.5c3-1.7 6-1.7 9-1v13c-3-.7-6-.7-9 1" />
        <path d="M12 6.5v13" />
      </>
    ),

    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2" />
        <path d="M16 5.5a3 3 0 0 1 0 5.5" />
        <path d="M17 14a5 5 0 0 1 4 5v1" />
      </>
    ),

    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),

    clipboard: (
      <>
        <rect x="4" y="4" width="16" height="17" rx="2" />
        <rect x="9" y="2" width="6" height="4" rx="1" />
        <path d="M8 11h8M8 15h8M8 19h5" />
      </>
    ),

    chart: (
      <>
        <path d="M4 20V4M4 20h17" />
        <path d="M8 16v-5M13 16V7M18 16V4" />
      </>
    ),
  };

  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...common}
    >
      {iconPaths[name]}
    </svg>
  );
}

export default function ProUniLoader({
  title,
  description,
  icon = "calendar",
  compact = false,
  className = "",
}: ProUniLoaderProps) {
  return (
    <section
      className={[
        styles.loader,
        compact ? styles.compact : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={title}
    >
      <div className={styles.iconContainer}>
        <LoaderIcon name={icon} />
      </div>

      <div className={styles.content}>
        <p className={styles.title}>{title}</p>

        {description && (
          <p className={styles.description}>
            {description}
          </p>
        )}
      </div>

      <div
        className={styles.progressTrack}
        aria-hidden="true"
      >
        <span className={styles.progressIndicator} />
      </div>
    </section>
  );
}
