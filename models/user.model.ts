export type UserRole = "mentee" | "mentor" | "coordinador";

export interface UserProfile {
  id: string;
  nombres: string;
  apellidos: string | null;
  email: string;
  rol: UserRole;
  activo: boolean;
}