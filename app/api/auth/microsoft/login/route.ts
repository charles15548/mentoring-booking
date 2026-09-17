import { NextResponse } from "next/server";

export async function GET() {
  const tenantId = process.env.MICROSOFT_TENANT_ID!;
  const clientId = process.env.MICROSOFT_CLIENT_ID!;

  const redirectUri =
    "http://localhost:3000/api/auth/microsoft/callback";

  const scopes = [
    "openid",
    "profile",
    "offline_access",
    "User.Read",
    "Bookings.Read.All",
    "BookingsAppointment.ReadWrite.All",
  ].join(" ");

  const url =
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_mode=query` +
    `&scope=${encodeURIComponent(scopes)}`;

  return NextResponse.redirect(url);
}