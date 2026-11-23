import type { ZodTypeAny, z } from 'zod';
import { badRequest } from '../utils/errors.js';

/** Parse `input` with `schema`, throwing a 400 VALIDATION_ERROR with field details on failure. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.flatten().fieldErrors;
    const first = result.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw badRequest(`${where}${first?.message ?? 'Invalid input'}`, fields);
  }
  return result.data;
}
