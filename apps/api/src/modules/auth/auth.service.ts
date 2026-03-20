import {
  ForbiddenException,
  BadRequestException,
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
import {
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_REGEX
} from '../../common/constants/password-policy';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PasswordResetTokenPayload } from './interfaces/password-reset-token-payload.interface';
import { PasswordResetMailService } from './password-reset-mail.service';
import { AuthResponse } from './types/auth-response.type';

@Injectable()
export class AuthService {
  private readonly bcryptSaltRounds: number;
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordResetMailService: PasswordResetMailService
  ) {
    this.bcryptSaltRounds = Number(this.configService.get<number>('BCRYPT_SALT_ROUNDS', 12));
    this.jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
  }

  async register(input: RegisterDto): Promise<AuthResponse> {
    const requestedRole = input.role ?? Role.STUDENT;
    if (requestedRole === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Public registration is not allowed for super administrators.');
    }
    const registrationStatus =
      requestedRole === Role.STUDENT ? UserStatus.ACTIVE : UserStatus.PENDING;
    const passwordHash = await bcrypt.hash(input.password, this.bcryptSaltRounds);

    const user = await this.usersService.createUser({
      role: requestedRole,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      passwordHash,
      status: registrationStatus
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
      throw new UnauthorizedException(
        'Your account is awaiting approval by the super administrator.'
      );
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    await this.usersService.updateLastLogin(user.userId);
    return this.issueTokenResponse(user);
  }

  async me(currentUser: {
    userId: string;
    role: Role;
    email: string;
    firstName: string;
    lastName: string;
  }) {
    return {
      userId: currentUser.userId,
      role: currentUser.role,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      email: currentUser.email,
      phone: null,
      status: UserStatus.ACTIVE,
      createdAt: new Date(0),
      updatedAt: new Date(0)
    };
  }

  async requestPasswordReset(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return {
        message:
          'If an account exists for that email address, a password reset link has been sent.'
      };
    }

    const resetToken = await this.jwtService.signAsync(
      {
        sub: user.userId,
        email: user.email,
        purpose: 'password_reset'
      } satisfies PasswordResetTokenPayload,
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET')
      }
    );

    await this.passwordResetMailService.sendPasswordResetEmail({
      email: user.email,
      firstName: user.firstName,
      resetUrl: this.buildPasswordResetUrl(resetToken)
    });

    return {
      message:
        'If an account exists for that email address, a password reset link has been sent.'
    };
  }

  async resetPassword(token: string, password: string) {
    if (!PASSWORD_POLICY_REGEX.test(password)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }

    let payload: PasswordResetTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<PasswordResetTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET')
      });
    } catch {
      throw new BadRequestException('Invalid password reset token.');
    }

    if (payload.purpose !== 'password_reset') {
      throw new BadRequestException('Invalid password reset token.');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.email !== payload.email) {
      throw new BadRequestException('Invalid password reset token.');
    }

    const passwordHash = await bcrypt.hash(password, this.bcryptSaltRounds);
    await this.usersService.updatePasswordHash(user.userId, passwordHash);

    return {
      message: 'Password reset successful.'
    };
  }

  private async issueTokenResponse(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.userId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtExpiresIn,
      user: this.usersService.toPublicUser(user)
    };
  }

  private buildPasswordResetUrl(resetToken: string): string {
    const frontendBaseUrl = this.configService
      .get<string>('FRONTEND_BASE_URL', 'http://localhost:5173')
      .replace(/\/+$/, '');

    return `${frontendBaseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
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
