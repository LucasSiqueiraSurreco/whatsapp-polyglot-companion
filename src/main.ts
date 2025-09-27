import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();

  logger.log('🚀 WhatsApp English Companion starting...');
  logger.log('📱 Waiting for WhatsApp QR code...');

  await app.listen(3000);
  logger.log('Application is running on: http://localhost:3000');
}

bootstrap();