import { pool } from "./index";

async function main() {
  const result = await pool.query("select 1 as ok");
  console.log(result.rows[0]);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
