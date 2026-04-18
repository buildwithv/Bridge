import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private client!: SupabaseClient<Database>;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.client = createClient<Database>(url, key, {
      auth: { persistSession: false },
    });

    this.logger.log('Supabase client initialized');
  }

  get db(): SupabaseClient<Database> {
    return this.client;
  }

  withUser(userId: string): SupabaseClient<Database> {
    return createClient<Database>(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: { persistSession: false },
        global: {
          headers: {
            'x-user-id': userId,
          },
        },
      },
    );
  }
}
