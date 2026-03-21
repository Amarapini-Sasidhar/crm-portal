import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { User } from './entities/user.entity';
import { PublicUser } from './types/public-user.type';

type CreateUserInput = {
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  passwordHash: string;
  status?: UserStatus;
  emailVerifiedAt?: Date | null;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>
  ) {}

  async createUser(input: CreateUserInput): Promise<User> {
    const normalizedEmail = input.email.toLowerCase().trim();
    const existingUser = await this.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('Email is already registered.');
    }

    const user = this.usersRepository.create({
      role: input.role,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: normalizedEmail,
      phone: input.phone?.trim() ?? null,
      passwordHash: input.passwordHash,
      status: input.status ?? UserStatus.ACTIVE,
      emailVerifiedAt: input.emailVerifiedAt ?? null
    });

    return this.usersRepository.save(user);
  }

  async findById(userId: string): Promise<User | null> {
    const rows = await this.usersRepository.query(
      `
        SELECT
          user_id AS "userId",
          role::text AS "role",
          first_name AS "firstName",
          last_name AS "lastName",
          email AS "email",
          phone AS "phone",
          password_hash AS "passwordHash", -- ✅ ADDED
          status::text AS "status",
          email_verified_at AS "emailVerifiedAt",
          last_login_at AS "lastLoginAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM crm.users
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );

    return this.mapRawUser(rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.usersRepository.query(
      `
        SELECT
          user_id AS "userId",
          role::text AS "role",
          first_name AS "firstName",
          last_name AS "lastName",
          email AS "email",
          phone AS "phone",
          password_hash AS "passwordHash", -- ✅ ADDED
          status::text AS "status",
          email_verified_at AS "emailVerifiedAt",
          last_login_at AS "lastLoginAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM crm.users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email.toLowerCase().trim()]
    );

    return this.mapRawUser(rows[0]);
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    const rows = await this.usersRepository.query(
      `
        SELECT
          user_id AS "userId",
          role::text AS "role",
          first_name AS "firstName",
          last_name AS "lastName",
          email AS "email",
          phone AS "phone",
          password_hash AS "passwordHash",
          status::text AS "status",
          email_verified_at AS "emailVerifiedAt",
          last_login_at AS "lastLoginAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM crm.users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email.toLowerCase().trim()]
    );

    return this.mapRawUser(rows[0], true);
  }

  async listByRole(role: Role): Promise<User[]> {
    const rows = await this.usersRepository.query(
      `
        SELECT
          user_id AS "userId",
          role::text AS "role",
          first_name AS "firstName",
          last_name AS "lastName",
          email AS "email",
          phone AS "phone",
          password_hash AS "passwordHash", -- ✅ ADDED
          status::text AS "status",
          email_verified_at AS "emailVerifiedAt",
          last_login_at AS "lastLoginAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM crm.users
        WHERE role::text = $1
        ORDER BY created_at DESC
      `,
      [role]
    );

    return rows.map((row: Record<string, unknown>) => this.mapRawUser(row)).filter(Boolean) as User[];
  }

  async findPendingUsers(): Promise<User[]> {
    const rows = await this.usersRepository.query(
      `
        SELECT
          user_id AS "userId",
          role::text AS "role",
          first_name AS "firstName",
          last_name AS "lastName",
          email AS "email",
          phone AS "phone",
          password_hash AS "passwordHash", -- ✅ ADDED
          status::text AS "status",
          email_verified_at AS "emailVerifiedAt",
          last_login_at AS "lastLoginAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM crm.users
        WHERE status::text = $1
        ORDER BY created_at DESC
      `,
      [UserStatus.PENDING]
    );

    return rows.map((row: Record<string, unknown>) => this.mapRawUser(row)).filter(Boolean) as User[];
  }

  async approveUser(userId: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.status !== UserStatus.PENDING) {
      throw new UnprocessableEntityException('User is not pending approval.');
    }

    user.status = UserStatus.ACTIVE;
    return this.usersRepository.save(user);
  }

  async updateStatus(userId: string, status: UserStatus, allowedRoles?: Role[]): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      throw new UnprocessableEntityException('User role is not allowed for this operation.');
    }

    user.status = status;
    return this.usersRepository.save(user);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.usersRepository.update({ userId }, { lastLoginAt: new Date() });
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.usersRepository.update({ userId }, { passwordHash });
  }

  // ✅ MODIFIED: expose full user
  toPublicUser(user: User): any {
    return user;
  }

  private mapRawUser(row: Record<string, unknown> | undefined, includePassword = false): User | null {
    if (!row) {
      return null;
    }

    const user = new User();
    user.userId = String(row.userId);
    user.role = row.role as Role;
    user.firstName = String(row.firstName);
    user.lastName = String(row.lastName);
    user.email = String(row.email);
    user.phone = row.phone === null ? null : String(row.phone);
    user.status = row.status as UserStatus;
    user.emailVerifiedAt = row.emailVerifiedAt ? new Date(String(row.emailVerifiedAt)) : null;
    user.lastLoginAt = row.lastLoginAt ? new Date(String(row.lastLoginAt)) : null;
    user.createdAt = new Date(String(row.createdAt));
    user.updatedAt = new Date(String(row.updatedAt));

    // ✅ MODIFIED: always include password
    user.passwordHash = String(row.passwordHash ?? '');

    return user;
  }
}