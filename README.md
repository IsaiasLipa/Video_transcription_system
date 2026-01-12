# Video Fetcher (Node + TypeScript)

Simple script to fetch video objects from the API and download MP4s by `_id`.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev -- --page 1 --results 10 --limit 3
```

Arguments:

- `--page`: page number (default: 1)
- `--results`: number of results to request (default: 10)
- `--limit`: number of downloads to perform (default: 3)
- `--out`: download directory (default: `./data/downloads`)
- `--collection`: collection id (default: `61b3adc8124d7d000891ca5c`)

## Notes

- Downloads are saved as `.mp4` using a sanitized title.
- This is intentionally minimal; no database or retries yet.
