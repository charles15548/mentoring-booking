export async function GET() {
  return Response.json({
    openapi: "3.1.0",

    info: {
      title: "PROUNI Mentorías API",
      version: "1.0.0",
      description:
        "API para consultar y confirmar mentorías asociadas a Microsoft Bookings.",
    },

    servers: [
      {
        url: "/",
        description: "Servidor actual",
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },

    paths: {
      "/api/mentors/reservas": {
        get: {
          summary: "Listar mentorías del mentor",
          description:
            "Obtiene las citas de Microsoft Bookings asignadas al mentor autenticado.",

          security: [
            {
              bearerAuth: [],
            },
          ],

          responses: {
            "200": {
              description: "Mentorías encontradas",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",

                      properties: {
                        id: {
                          type: "string",
                        },

                        serviceName: {
                          type: "string",
                        },

                        menteeName: {
                          type: ["string", "null"],
                        },

                        menteeEmail: {
                          type: ["string", "null"],
                        },

                        startDateTime: {
                          type: "object",
                        },

                        endDateTime: {
                          type: "object",
                        },

                        onlineMeetingUrl: {
                          type: ["string", "null"],
                        },

                        confirmed: {
                          type: "boolean",
                        },

                        confirmedAt: {
                          type: ["string", "null"],
                        },

                        status: {
                          type: "string",
                        },
                      },
                    },
                  },
                },
              },
            },

            "401": {
              description: "Sesión inválida",
            },

            "403": {
              description: "Usuario sin permisos",
            },

            "500": {
              description: "Error interno",
            },
          },
        },

        post: {
          summary: "Confirmar mentoría",

          security: [
            {
              bearerAuth: [],
            },
          ],

          requestBody: {
            required: true,

            content: {
              "application/json": {
                schema: {
                  type: "object",

                  required: [
                    "microsoftBookingId",
                  ],

                  properties: {
                    microsoftBookingId: {
                      type: "string",
                    },
                  },
                },

                example: {
                  microsoftBookingId:
                    "AAMkAG...",
                },
              },
            },
          },

          responses: {
            "200": {
              description:
                "Mentoría confirmada",
            },

            "400": {
              description:
                "microsoftBookingId faltante",
            },

            "401": {
              description:
                "Sesión inválida",
            },

            "403": {
              description:
                "Mentoría no pertenece al mentor",
            },

            "500": {
              description:
                "Error interno",
            },
          },
        },
      },
    },
  });
}