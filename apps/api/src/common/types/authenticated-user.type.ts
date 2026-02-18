import { Role } from '../enums/role.enum';

export type AuthenticatedUser = {
  userId: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
};
