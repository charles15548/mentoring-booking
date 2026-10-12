export type UserRole = "mentee" | "mentor" | "coordinador";

export interface UserProfile {
  id: string;
  nombres: string;
  apellidos: string | null;
  email: string;
  rol: UserRole;
  activo: boolean;
  foto_url: string | null;
  debe_cambiar_password: boolean;
}