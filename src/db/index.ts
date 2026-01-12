import { config } from "../config";
import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});
