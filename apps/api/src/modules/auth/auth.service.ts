import {
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Role } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { CreateManagedUserDto } from '../users/dto/create-managed-user.dto';
import { User } from '../users/entities/user.entity';
import { PublicUser } from '../users/types/public-user.type';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthResponse } from './types/auth-response.type';

@Injectable()
export class AuthService {
  private readonly bcryptSaltRounds: number;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {
    this.bcryptSaltRounds = Number(this.configService.get<number>('BCRYPT_SALT_ROUNDS', 12));
    this.jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
  }

  async registerStudent(input: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await bcrypt.hash(input.password, this.bcryptSaltRounds);

    const user = await this.usersService.createUser({
      role: Role.STUDENT,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      passwordHash
    });

    return this.issueTokenResponse(user);
  }

  async createManagedUser(
    roleToCreate: Role,
    input: CreateManagedUserDto,
    actorRole: Role
  ): Promise<PublicUser> {
    this.assertActorPermission(actorRole, roleToCreate);
    const passwordHash = await bcrypt.hash(input.password, this.bcryptSaltRounds);

    const user = await this.usersService.createUser({
      role: roleToCreate,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      passwordHash
    });

    return this.usersService.toPublicUser(user);
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmailWithPassword(input.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active.');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.usersService.updateLastLogin(user.userId);
    return this.issueTokenResponse(user);
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return this.usersService.toPublicUser(user);
  }

  private async issueTokenResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.userId,
      role: user.role,
      email: user.email
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtExpiresIn,
      user: this.usersService.toPublicUser(user)
    };
  }

  private assertActorPermission(actorRole: Role, roleToCreate: Role): void {
    if (actorRole === Role.SUPER_ADMIN) {
      return;
    }

    if (actorRole === Role.ADMIN && roleToCreate === Role.STUDENT) {
      return;
    }

    throw new ForbiddenException('Not allowed to create this user role.');
  }
}
