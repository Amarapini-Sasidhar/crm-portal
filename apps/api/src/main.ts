import 'reflect-metadata';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {

  // Create Fastify adapter
  const adapter = new FastifyAdapter();

  // ---- REGISTER FASTIFY PLUGINS BEFORE NEST STARTS ----
  await (adapter as any).register(cors, {
    origin: 'http://localhost:5173',
    credentials: true,
  });

  await (adapter as any).register(multipart, {
    limits: {
      files: 1,
      fileSize: 5 * 1024 * 1024,
    },
  });

  await (adapter as any).register(fastifyStatic, {
    root: join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });

  // Start NestJS using Fastify
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  app.setGlobalPrefix('api/v1');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Read PORT from .env
  const configService = app.get(ConfigService);
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;

  await app.listen(port, '0.0.0.0');
  console.log(`Server running on port ${port}`);
}

bootstrap();
