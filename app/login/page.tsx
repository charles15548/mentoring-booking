import { redirect } from "next/navigation";
import LocalLoginForm from "./local-login-form";

const externalLoginUrl = process.env.NEXT_PUBLIC_EXTERNAL_LOGIN_URL;
const useExternalLogin =
  process.env.NEXT_PUBLIC_LOGIN_MODE === "external" && externalLoginUrl;

export default function LoginPage() {
  if (useExternalLogin) {
    redirect(externalLoginUrl);
  }

  return <LocalLoginForm />;
}
