import { pool } from "../db";

export type TranscriptRecord = {
  videoId: string;
  transcript: string;
};

export async function createTranscript(record: TranscriptRecord): Promise<void> {
  await pool.query(
    `
    INSERT INTO transcripts (video_id, transcript)
    VALUES ($1, $2)
    `,
    [record.videoId, record.transcript],
  );
}

export async function listTranscripts(limit = 50): Promise<TranscriptRecord[]> {
  const result = await pool.query(
    `
    SELECT video_id, transcript
    FROM transcripts
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit],
  );
  return result.rows.map((row) => ({
    videoId: row.video_id,
    transcript: row.transcript,
  }));
}
