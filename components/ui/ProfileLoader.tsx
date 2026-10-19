
"use client";

import styles from "./ProfileLoader.module.css";

export default function ProfileLoader() {
  return (
    <div
      className={styles.container}
      role="status"
      aria-live="polite"
      aria-label="Cargando perfil"
    >
      <div className={styles.spinner} aria-hidden="true" />

      <span className={styles.text}>
        Cargando perfil...
      </span>
    </div>
  );
}
