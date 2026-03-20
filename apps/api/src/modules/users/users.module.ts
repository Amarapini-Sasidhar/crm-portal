import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserSchemaMaintenanceService } from './user-schema-maintenance.service';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, UserSchemaMaintenanceService],
  exports: [UsersService]
})
export class UsersModule {}
