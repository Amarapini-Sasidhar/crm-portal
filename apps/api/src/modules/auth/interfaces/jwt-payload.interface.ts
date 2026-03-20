import { Role } from '../../../common/enums/role.enum';

export interface JwtPayload {
  sub: string;
  role: Role;
  email: string;
  firstName: string;
  lastName: string;
}
