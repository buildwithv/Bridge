import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.spec.ts',
        '**/*.module.ts',
        '**/*.controller.ts',
        '**/*.gateway.ts',
        '**/*.dto.ts',
        '**/*.types.ts',
        '**/*.pipe.ts',
        'src/main.ts',
        'src/config/**',
        'src/app.service.ts',
        'src/app.controller.ts',
        'src/database/database.service.ts',
        'src/upload/upload.service.ts',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
