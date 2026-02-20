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
      status: input.status ?? UserStatus.ACTIVE
    });

    return this.usersRepository.save(user);
  }

  async findById(userId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { userId } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase().trim() }
    });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.toLowerCase().trim() })
      .getOne();
  }

  async listByRole(role: Role): Promise<User[]> {
    return this.usersRepository.find({
      where: { role },
      order: { createdAt: 'DESC' }
    });
  }

  async findPendingUsers(): Promise<User[]> {
    return this.usersRepository.find({
      where: { status: UserStatus.PENDING },
      order: { createdAt: 'DESC' }
    });
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

  toPublicUser(user: User): PublicUser {
    return {
      userId: user.userId,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}
