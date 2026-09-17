const graphBaseUrl = "https://graph.microsoft.com/v1.0";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

export async function getMicrosoftAccessToken() {
  const tenantId = requiredEnv("MICROSOFT_TENANT_ID");
  const clientId = requiredEnv("MICROSOFT_CLIENT_ID");
  const clientSecret = requiredEnv("MICROSOFT_CLIENT_SECRET");

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`Microsoft token error: ${response.status}`);
  }

  const data = await response.json();

  return data.access_token as string;
}

export async function graphRequest<T>(
  path: string,
  init?: RequestInit
) {
  const token = await getMicrosoftAccessToken();

  const response = await fetch(`${graphBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  const rawBody = await response.text();

  if (!response.ok) {
    const requestId = response.headers.get("request-id");
    const clientRequestId =
      response.headers.get("client-request-id");
    const date = response.headers.get("date");

    console.error("===== MICROSOFT GRAPH ERROR =====");
    console.error("Path:", path);
    console.error("Method:", init?.method ?? "GET");
    console.error("Status:", response.status);
    console.error("StatusText:", response.statusText);
    console.error("request-id:", requestId);
    console.error("client-request-id:", clientRequestId);
    console.error("date:", date);
    console.error("response body:", rawBody);
    console.error("=================================");

    throw new Error(
      [
        `Microsoft Graph error: ${response.status} ${response.statusText}`,
        requestId ? `request-id: ${requestId}` : "",
        clientRequestId
          ? `client-request-id: ${clientRequestId}`
          : "",
        date ? `date: ${date}` : "",
        rawBody ? `body: ${rawBody}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }

  if (!rawBody) {
    return {} as T;
  }

  return JSON.parse(rawBody) as T;
}

export function getBookingBusinessId() {
  return requiredEnv("MICROSOFT_BOOKING_BUSINESS_ID");
}

export function toGraphUtcDateTime(value: string) {
  return new Date(value).toISOString().replace("Z", "");
}

export function toGraphLocalDateTime(
  value: string,
  timeZone = "America/Lima"
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}