import { drizzle } from "drizzle-orm/d1";
import * as schema from "./knowledge-schema";

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}
