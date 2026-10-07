import type { JsonValue } from '../shared/api/common';
export class ApiProblem extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 502 | 503, public code: string, message: string, public details?: JsonValue) { super(message); }
}
