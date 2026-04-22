import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(__dirname, '..', 'public'));

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application running on port ${port}`);
}

bootstrap().catch((err: unknown) => {
  new Logger('Bootstrap').error('Failed to start application', err);
  process.exit(1);
});
