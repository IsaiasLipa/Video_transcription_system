import { ingestVideos } from "./jobs/ingestVideos";

// cron-triggered worker
ingestVideos().catch((error) => {
  console.error(error);
  process.exit(1);
});
