import { PublicUser } from '../../users/types/public-user.type';

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: PublicUser;
};
