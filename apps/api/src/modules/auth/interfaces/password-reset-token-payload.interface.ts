export interface PasswordResetTokenPayload {
  sub: string;
  email: string;
  purpose: 'password_reset';
}
