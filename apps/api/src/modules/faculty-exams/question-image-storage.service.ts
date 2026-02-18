import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const IMAGE_MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class QuestionImageStorageService {
  private readonly uploadDirectory = join(process.cwd(), 'uploads', 'question-images');

  async saveQuestionImage(file: MultipartFile) {
    const normalizedMimeType = file.mimetype.toLowerCase();
    const allowedExtension = IMAGE_MIME_TO_EXTENSION[normalizedMimeType];

    if (!allowedExtension) {
      throw new BadRequestException('Only JPEG, PNG, and WEBP images are allowed.');
    }

    const buffer = await file.toBuffer();
    if (buffer.length === 0) {
      throw new BadRequestException('Uploaded image is empty.');
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new PayloadTooLargeException('Image size exceeds 5MB limit.');
    }

    await mkdir(this.uploadDirectory, { recursive: true });

    const fileName = `${Date.now()}-${randomUUID()}${allowedExtension}`;
    const absolutePath = join(this.uploadDirectory, fileName);

    await writeFile(absolutePath, buffer);

    return {
      imageKey: `question-images/${fileName}`,
      imageName: fileName,
      imageUrl: `/uploads/question-images/${fileName}`
    };
  }
}
