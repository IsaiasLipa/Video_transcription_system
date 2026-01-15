import dotenv from "dotenv";

dotenv.config({ override: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export const config = {
  databaseUrl: requireEnv("DATABASE_URL"),
  openaiApiKey: requireEnv("OPENAI_API_KEY"),
  houseCaBundlePath: process.env.HOUSE_CA_BUNDLE,
};
