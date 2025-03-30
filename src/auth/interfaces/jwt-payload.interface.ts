export interface JWTPayload {
  userId: string;
  email?: string;
  ethAddress: string; 
  role?: string;
  permissions?: any[];
  isTwoFactorAuthenticated?: boolean;
  iat?: number;
  exp?: number;
}