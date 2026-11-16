# Michigan Legislature Video Transcription Pipeline

A Node.js/TypeScript worker that finds recent **Michigan House and Senate** hearing videos, downloads them, and transcribes them with **OpenAI Whisper**. It stores video status and transcripts in **PostgreSQL**. It's built to run on a schedule (for example, cron): each run picks up new videos and retries failed ones.

## How it works

```
             ┌──────────────┐     ┌──────────────┐
             │ House archive│     │ Senate API   │
             │ (HTML scrape)│     │ (JSON POST)  │
             └──────┬───────┘     └──────┬───────┘
                    │  videos from the last month
                    ▼                    ▼
              ┌────────────────────────────────┐
              │  ingestVideos (House → Senate) │
              └──────────────┬─────────────────┘
       new IDs → `videos` table (TO_BE_TRANSCRIBE)
                             │
          for each video not yet TRANSCRIBED:
     IN_PROGRESS → download → ffmpeg (audio) → Whisper
                             │
          ┌──────────────────┴──────────────────┐
          ▼                                     ▼
   `transcripts` table                   ./transcripts/*.txt
   video → TRANSCRIBED            (on error → FAILED + backoff)
```

1. **Fetch:** scrape the House video archive with `cheerio` (the current year's archive, plus last year's in January), and query the Senate's video API. Only videos from the last month are kept.
2. **Track:** insert new video IDs into `videos` with status `TO_BE_TRANSCRIBE`.
3. **Process:** for each video that isn't `TRANSCRIBED` or `IN_PROGRESS`, and isn't waiting out a retry backoff:
   - download it to `./videos/`
   - extract the audio to MP3 with `ffmpeg`
   - split audio larger than 24 MB into 15-minute chunks, to stay under Whisper's upload limit
   - transcribe with `whisper-1` (with retries and exponential backoff)
   - save the transcript to the `transcripts` table and `./transcripts/`
4. **Recover:**
   - A failure records the error, the stage it failed in (`DOWNLOAD`, `TRANSCRIBE` or `DB_WRITE`) and a retry count, and sets `next_retry_at` with exponential backoff (30 min × 2ⁿ). The video is skipped until that time passes.
   - At the start of each run, videos stuck `IN_PROGRESS` for more than 2 hours are reset to `TO_BE_TRANSCRIBE`.

## Project structure

```
src/
├── run.ts                         # Entry point (cron target)
├── config.ts                      # Env var loading/validation
├── db/index.ts                    # pg connection pool
├── jobs/ingestVideos.ts           # Orchestrates fetch → download → transcribe per source
├── sources/house.ts               # House archive scraper + downloader (custom CA support)
├── sources/senate.ts              # Senate API client + downloader
├── transcription/videoTranscription.ts  # ffmpeg audio extraction, chunking, Whisper
├── services/videos.ts             # Video status / retry bookkeeping
├── services/transcripts.ts        # Transcript persistence
└── utils/                         # retry, date, video selection helpers
tests/                             # Vitest unit tests for utils
```

## Prerequisites

- Node.js 20.18+ (22 recommended)
- PostgreSQL (Neon works fine)
- `ffmpeg` on your `PATH`
- An OpenAI API key

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
OPENAI_API_KEY=sk-...
HOUSE_CA_BUNDLE=house.chain.pem   # optional, see below
```

### Database schema

```sql
CREATE TABLE IF NOT EXISTS videos (
  id                TEXT PRIMARY KEY,
  source            TEXT,
  name              TEXT,
  status            TEXT DEFAULT 'NEW',
  original_date     TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  retry_count       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  last_error_at     TIMESTAMP,
  last_error_stage  TEXT,
  next_retry_at     TIMESTAMP,
  in_progress_at    TIMESTAMP,
  transcribed_at    TIMESTAMP,
  status_updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT videos_status_check
    CHECK (status IN ('NEW','TO_BE_TRANSCRIBE','IN_PROGRESS','FAILED','TRANSCRIBED'))
);

CREATE TABLE IF NOT EXISTS transcripts (
  id         SERIAL PRIMARY KEY,
  video_id   TEXT UNIQUE REFERENCES videos(id) ON DELETE CASCADE,
  transcript TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### TLS workaround for the House site

`house.mi.gov` sometimes serves an incomplete certificate chain, which makes Node's `fetch` fail. You can build a CA bundle locally:

```bash
openssl s_client -showcerts -servername www.house.mi.gov -connect www.house.mi.gov:443 </dev/null 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print}' > ./house.chain.pem
```

Then set `HOUSE_CA_BUNDLE=house.chain.pem`. If the variable isn't set, the scraper looks for `./house.chain.pem`. The repo also includes the House intermediate and root certificates (`house.*.crt` / `.pem`) for reference.

## Running

```bash
npm run dev -- src/run.ts
```

This processes House, then Senate, one after the other, and exits. To run the compiled version:

```bash
npm run build
npm start
```

### Scheduling with cron

```cron
0 * * * * cd /path/to/Video_transcription_system && npm run dev -- src/run.ts >> cron.log 2>&1
```

## Tests

```bash
npm test
```

Vitest unit tests cover the retry helper, the date filtering and archive-year selection, and the video-selection logic (including the retry backoff).

## Output

| Location                | Contents |
| ----------------------- | -------- |
| `videos` table          | One row per discovered video, with status and retry metadata |
| `transcripts` table     | One transcript per video (upserted) |
| `./videos/`             | Downloaded video files |
| `./transcripts/`        | Plain-text transcripts |

`videos/`, `transcripts/` and `.env` are git-ignored.
