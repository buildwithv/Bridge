import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  LLM_PROVIDER!: string;

  @IsString()
  LLM_MODEL!: string;

  @IsString()
  @IsOptional()
  GROQ_API_KEY?: string;

  @IsString()
  @IsOptional()
  ANTHROPIC_API_KEY?: string;

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  EMBEDDING_PROVIDER: string = 'ollama';

  @IsString()
  EMBEDDING_MODEL!: string;

  @IsNumber()
  @IsOptional()
  EMBEDDING_DIMENSIONS: number = 768;

  @IsString()
  @IsOptional()
  OLLAMA_BASE_URL: string = 'http://localhost:11434';

  @IsString()
  @IsOptional()
  COHERE_API_KEY?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = '*';
}

export function validateConfig(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
