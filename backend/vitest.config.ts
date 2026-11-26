import { defineConfig } from 'vitest/config';

// Fixed env so tests behave the same on every machine and in CI, regardless of a local .env.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      ML_URL: 'http://ml.test',
      ML_API_KEY: 'test-ml-key',
      SMTP_HOST: '',
      ENABLE_JOBS: 'false',
    },
  },
});
