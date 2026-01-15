# State Affairs Ingestor (Node + TypeScript)

Ingests Michigan House and Senate hearing videos, downloads them, and creates transcripts. Designed for cron-friendly, repeatable runs with retry tracking in Postgres.

## Prerequisites

- Node.js 18+ (22 recommended)
- PostgreSQL (Neon works)
- ffmpeg installed and available on PATH

## Setup

```bash
npm install
```

Create a `.env` file (do not commit it):

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
OPENAI_API_KEY=sk-...
HOUSE_CA_BUNDLE=house.chain.pem
```

## TLS note (House site)

The Michigan House site sometimes serves an incomplete TLS chain. Generate a CA bundle locally and point the app to it:

```bash
openssl s_client -showcerts -servername www.house.mi.gov -connect www.house.mi.gov:443 </dev/null 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print}' > ./house.chain.pem
```

Then set `HOUSE_CA_BUNDLE=house.chain.pem` in `.env`.

## Database setup

Create the tables (example):

```sql
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  source TEXT,
  name TEXT,
  status TEXT DEFAULT 'NEW',
  original_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMP,
  last_error_stage TEXT,
  next_retry_at TIMESTAMP,
  in_progress_at TIMESTAMP,
  transcribed_at TIMESTAMP,
  status_updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transcripts (
  id SERIAL PRIMARY KEY,
  video_id TEXT REFERENCES videos(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE transcripts
ADD CONSTRAINT IF NOT EXISTS transcripts_video_id_key UNIQUE (video_id);
```

Optional status constraint:

```sql
ALTER TABLE videos
ADD CONSTRAINT IF NOT EXISTS videos_status_check
CHECK (status IN ('NEW','TO_BE_TRANSCRIBE','IN_PROGRESS','FAILED','TRANSCRIBED'));
```

## Run

```bash
npm run dev -- src/run.ts
```

This runs House then Senate ingestion sequentially.

## Tests

```bash
npm install
npm test
```

## Cron example

```cron
0 * * * * cd /path/to/State_Affairs && npm run dev -- src/run.ts >> /path/to/State_Affairs/cron.log 2>&1
```

## Notes

- Downloads are stored under `./videos/`.
- Transcripts are written to `./transcripts/`.
- Retries are tracked in the `videos` table; items with `next_retry_at` in the future are skipped.
