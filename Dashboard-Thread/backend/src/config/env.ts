import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment schema validation
const envSchema = z.object({
  PORT: z.string().default('8080').transform(Number),
  OT_CTL_PATH: z.string().default('./tools/ot-ctl'),
  OT_CTL_SOCKET_PATH: z.string().optional(),
  OT_CTL_USE_SUDO: z.string().default('false').transform((val) => val === 'true'),
  OT_DAEMON_PATH: z.string().default('./tools/ot-daemon'),
  OT_DAEMON_USE_SUDO: z.string().default('true').transform((val) => val === 'true'),
  OT_DAEMON_VERBOSE: z.string().default('false').transform((val) => val === 'true'),
  OT_DAEMON_DEFAULT_DEVICE: z.string().default('/dev/ttyACM0'),
  OT_DAEMON_DEFAULT_BAUDRATE: z.string().default('460800').transform(Number),
  AUTH_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Invalid environment variables:');
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export default env;
