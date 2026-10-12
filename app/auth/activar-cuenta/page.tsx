
"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import "./activar-cuenta.css";

const LOGIN_URL =
  "https://mentoriaprouni.intelectiasac.com/";

type Estado =
  | "verificando"
  | "listo"
  | "error"
  | "completado";

export default function ActivarCuentaPage() {
  const [estado, setEstado] =
    useState<Estado>("verificando");

  const [cuentaActivada, setCuentaActivada] =
    useState<boolean | null>(null);

  const [email, setEmail] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [mostrarPassword, setMostrarPassword] =
    useState(false);

  const [guardando, setGuardando] = useState(false);

  const esActivacionInicial = cuentaActivada === false;

  useEffect(() => {
    let activo = true;

    async function verificarEnlace() {
      try {
        const url = new URL(window.location.href);

        const hash = new URLSearchParams(
          window.location.hash.replace(/^#/, ""),
        );

        const errorEnlace =
          url.searchParams.get("error_description") ||
          hash.get("error_description");

        if (errorEnlace) {
          if (activo) {
            setMensaje(
              "Este enlace ha caducado o ya no es válido. Solicita uno nuevo al coordinador.",
            );
            setEstado("error");
          }
          return;
        }

        const tokenHash =
          url.searchParams.get("token_hash");

        const tipo = url.searchParams.get("type");

        const code = url.searchParams.get("code");

        const tieneTokens =
          Boolean(hash.get("access_token")) &&
          Boolean(hash.get("refresh_token")) &&
          ["recovery", "invite"].includes(
            hash.get("type") ?? "",
          );

        if (!tokenHash && !code && !tieneTokens) {
          if (activo) {
            setMensaje(
              "Para continuar, abre el enlace que recibiste en tu correo electrónico.",
            );
            setEstado("error");
          }
          return;
        }

        if (tokenHash) {
          if (
            tipo !== "recovery" &&
            tipo !== "invite"
          ) {
            throw new Error(
              "El tipo de enlace no es válido.",
            );
          }

          const { error } =
            await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: tipo,
            });

          if (error) throw error;
        } else if (code) {
          const { error } =
            await supabase.auth.exchangeCodeForSession(
              code,
            );

          if (error) throw error;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          throw new Error(
            "No se pudo validar tu sesión. Solicita un nuevo enlace.",
          );
        }

        const response = await fetch(
          "/api/auth/estado-activacion",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "No se pudo consultar el estado de tu cuenta.",
          );
        }

        if (
          typeof data.cuenta_activada !== "boolean"
        ) {
          throw new Error(
            "El estado de activación no es válido.",
          );
        }

        if (!activo) return;

        setCuentaActivada(data.cuenta_activada);
        setEmail(session.user.email ?? "");
        setEstado("listo");

        window.history.replaceState(
          {},
          "",
          "/auth/activar-cuenta",
        );
      } catch (error) {
        if (!activo) return;

        console.error(
          "[activar-cuenta] Error de validación:",
          error,
        );

        setMensaje(
          error instanceof Error
            ? error.message
            : "No se pudo validar el enlace.",
        );

        setEstado("error");
      }
    }

    void verificarEnlace();

    return () => {
      activo = false;
    };
  }, []);

  async function guardarPassword(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setMensaje("");

    if (password.length < 8) {
      setMensaje(
        "La contraseña debe contener al menos 8 caracteres.",
      );
      return;
    }

    if (password !== confirmacion) {
      setMensaje(
        "Las contraseñas ingresadas no coinciden.",
      );
      return;
    }

    try {
      setGuardando(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error(
          "La sesión ha expirado. Solicita un nuevo enlace.",
        );
      }

      const { error: passwordError } =
        await supabase.auth.updateUser({
          password,
        });

      if (passwordError) throw passwordError;

      if (esActivacionInicial) {
        const {
          data: { session: sesionActualizada },
        } = await supabase.auth.getSession();

        if (!sesionActualizada) {
          throw new Error(
            "La contraseña se guardó, pero no se pudo comprobar la sesión para registrar la activación.",
          );
        }

        const response = await fetch(
          "/api/auth/estado-activacion",
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${sesionActualizada.access_token}`,
            },
          },
        );

        const data = await response.json();

        if (
          !response.ok ||
          data.cuenta_activada !== true
        ) {
          throw new Error(
            "La contraseña se guardó, pero quedó pendiente registrar la activación. Comunícate con el coordinador.",
          );
        }

        // Se conserva el estado original para que el
        // mensaje final diga "Cuenta activada".
      }

      setPassword("");
      setConfirmacion("");
      setEstado("completado");

      const { error: signOutError } =
        await supabase.auth.signOut();

      if (signOutError) {
        console.error(
          "[activar-cuenta] Error al cerrar sesión:",
          signOutError,
        );
      }
    } catch (error) {
      setMensaje(
        error instanceof Error
          ? error.message
          : "No se pudo completar la operación.",
      );
    } finally {
      setGuardando(false);
    }
  }

  const tituloPantalla = esActivacionInicial
    ? "Activa tu cuenta"
    : "Restablece tu contraseña";

  const descripcionPantalla = esActivacionInicial
    ? "Crea una contraseña segura y comienza tu experiencia de mentoría."
    : "Establece una nueva contraseña para continuar utilizando ProUni.";

  return (
    <main className="prouni-auth-page">
      <div className="prouni-auth-shell">
        {/* PANEL INSTITUCIONAL */}
        <aside className="prouni-auth-brand">
          <div className="prouni-auth-brand-top">
            <div className="prouni-auth-logo-container">
              <img
                src="/LogoProUni.jpg"
                alt="Logo ProUni"
                className="prouni-auth-logo"
              />
            </div>

            <div className="prouni-auth-brand-name">
              PROUNI
              <span>MENTORÍAS</span>
            </div>
          </div>

          <div className="prouni-auth-brand-content">
            <div className="prouni-auth-tag">
              PROGRAMA DE MENTORÍAS
            </div>

            <h1>
              Conectamos
              <br />
              experiencias.
              <br />
              <span>Construimos futuro.</span>
            </h1>

            <p>
              Un espacio para compartir conocimientos,
              fortalecer capacidades y acompañar tu
              desarrollo profesional.
            </p>

            <div className="prouni-auth-brand-features">
              <div className="prouni-auth-feature">
                <span className="prouni-auth-feature-icon">
                  01
                </span>
                <span>Aprende de la experiencia</span>
              </div>

              <div className="prouni-auth-feature">
                <span className="prouni-auth-feature-icon">
                  02
                </span>
                <span>Fortalece tus habilidades</span>
              </div>

              <div className="prouni-auth-feature">
                <span className="prouni-auth-feature-icon">
                  03
                </span>
                <span>Alcanza tus objetivos</span>
              </div>
            </div>
          </div>

          <div className="prouni-auth-brand-footer">
            <span>ProUni Mentorías</span>
            <span>Formando conexiones de valor</span>
          </div>

          <div className="prouni-auth-decoration deco-one" />
          <div className="prouni-auth-decoration deco-two" />
          <div className="prouni-auth-decoration deco-three" />
        </aside>

        {/* PANEL DE FORMULARIO */}
        <section className="prouni-auth-form-panel">
          <div className="prouni-auth-mobile-brand">
            <img
              src="/LogoProUni.jpg"
              alt="Logo ProUni"
            />
            <span>ProUni Mentorías</span>
          </div>

          <div className="prouni-auth-form-container">
            {estado === "verificando" && (
              <div className="prouni-auth-state">
                <div className="prouni-auth-spinner" />

                <h2>Verificando tu enlace</h2>

                <p>
                  Estamos validando tu acceso.
                  Esto tomará solo un momento.
                </p>
              </div>
            )}

            {estado === "error" && (
              <div className="prouni-auth-state">
                <div className="prouni-auth-status-icon prouni-auth-status-error">
                  !
                </div>

                <div className="prouni-auth-eyebrow">
                  NO SE PUDO CONTINUAR
                </div>

                <h2>Enlace no disponible</h2>

                <p role="alert">{mensaje}</p>

                <div className="prouni-auth-help">
                  Si necesitas un nuevo enlace,
                  comunícate con el coordinador
                  del programa.
                </div>

                <a
                  href={LOGIN_URL}
                  className="prouni-auth-secondary-link"
                >
                  Volver al inicio
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            )}

            {estado === "listo" && (
              <>
                <div className="prouni-auth-form-header">
                  <div className="prouni-auth-eyebrow">
                    {esActivacionInicial
                      ? "BIENVENIDO A PROUNI"
                      : "SEGURIDAD DE TU CUENTA"}
                  </div>

                  <h2>{tituloPantalla}</h2>

                  <p>{descripcionPantalla}</p>
                </div>

                {email && (
                  <div className="prouni-auth-account">
                    <div className="prouni-auth-account-avatar">
                      {email
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div>
                      <span>CUENTA ASOCIADA</span>
                      <strong>{email}</strong>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={guardarPassword}
                  className="prouni-auth-form"
                >
                  <div className="prouni-auth-field">
                    <label htmlFor="nueva-password">
                      {esActivacionInicial
                        ? "Crea tu contraseña"
                        : "Nueva contraseña"}
                    </label>

                    <input
                      id="nueva-password"
                      type={
                        mostrarPassword
                          ? "text"
                          : "password"
                      }
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      autoComplete="new-password"
                      placeholder="Ingresa tu contraseña"
                      minLength={8}
                      required
                      disabled={guardando}
                    />

                    <span className="prouni-auth-hint">
                      Mínimo 8 caracteres
                    </span>
                  </div>

                  <div className="prouni-auth-field">
                    <label htmlFor="confirmar-password">
                      Confirmar contraseña
                    </label>

                    <input
                      id="confirmar-password"
                      type={
                        mostrarPassword
                          ? "text"
                          : "password"
                      }
                      value={confirmacion}
                      onChange={(event) =>
                        setConfirmacion(event.target.value)
                      }
                      autoComplete="new-password"
                      placeholder="Repite tu contraseña"
                      minLength={8}
                      required
                      disabled={guardando}
                    />
                  </div>

                  <label className="prouni-auth-show-password">
                    <input
                      type="checkbox"
                      checked={mostrarPassword}
                      onChange={(event) =>
                        setMostrarPassword(
                          event.target.checked,
                        )
                      }
                      disabled={guardando}
                    />
                    <span>Mostrar contraseñas</span>
                  </label>

                  {mensaje && (
                    <div
                      className="prouni-auth-alert"
                      role="alert"
                    >
                      {mensaje}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="prouni-auth-submit"
                    disabled={guardando}
                  >
                    {guardando
                      ? "Guardando..."
                      : esActivacionInicial
                        ? "Activar mi cuenta"
                        : "Guardar nueva contraseña"}

                    {!guardando && (
                      <span aria-hidden="true">
                        →
                      </span>
                    )}
                  </button>
                </form>

                <div className="prouni-auth-security">
                  <span aria-hidden="true">✦</span>
                  Tu contraseña es personal.
                  No la compartas con otras personas.
                </div>
              </>
            )}

            {estado === "completado" && (
              <div className="prouni-auth-state">
                <div className="prouni-auth-status-icon prouni-auth-status-success">
                  ✓
                </div>

                <div className="prouni-auth-eyebrow">
                  PROCESO COMPLETADO
                </div>

                <h2>
                  {esActivacionInicial
                    ? "¡Tu cuenta está activada!"
                    : "¡Contraseña actualizada!"}
                </h2>

                <p>
                  {esActivacionInicial
                    ? "Tu cuenta de ProUni Mentorías está lista. Ya puedes iniciar sesión y comenzar tu experiencia."
                    : "Tu nueva contraseña se guardó correctamente. Ya puedes ingresar a ProUni Mentorías."}
                </p>

                <a
                  href={LOGIN_URL}
                  className="prouni-auth-submit prouni-auth-success-link"
                >
                  Ir a iniciar sesión
                  <span aria-hidden="true">→</span>
                </a>
              </div>
            )}
          </div>

          <footer className="prouni-auth-form-footer">
            © ProUni Mentorías · Acceso seguro
          </footer>
        </section>
      </div>
    </main>
  );
}
