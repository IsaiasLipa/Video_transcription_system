import { pool } from "../db";

export type VideoRecord = {
    id: string;
    source?: string | null;
    name?: string | null;
    status?: string | null;
    original_date?: Date | string | null;
    next_retry_at?: Date | string | null;
};

export async function upsertVideo(video: VideoRecord): Promise<void> {
    const originalDate =
        video.original_date instanceof Date
            ? video.original_date.toISOString()
            : video.original_date ?? null;
    await pool.query(
        `
    INSERT INTO videos (id, source, name, status, original_date)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
      source = COALESCE(EXCLUDED.source, videos.source),
      name = COALESCE(EXCLUDED.name, videos.name),
      status = COALESCE(EXCLUDED.status, videos.status),
      original_date = COALESCE(EXCLUDED.original_date, videos.original_date)
    `,
        [video.id, video.source ?? null, video.name, video.status ?? null, originalDate],
    );
}

export async function listVideos(source: string): Promise<VideoRecord[]> {
    const params: Array<string | number> = [source];
    let query = `
        SELECT id, source, name, status, original_date
        FROM videos
        WHERE source = $1
    `;
    query += ` AND (status IS NULL OR status <> 'TRANSCRIBED')`;
    query += ` AND (next_retry_at IS NULL OR next_retry_at <= NOW())`;
    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    return result.rows.map((row) => ({
        id: row.id,
        source: row.source,
        name: row.name,
        status: row.status,
        original_date: row.original_date
    }));
}

export async function updateVideoStatus(id: string, status: string): Promise<void> {
    await pool.query(
        `UPDATE videos SET status = $2, status_updated_at = NOW() WHERE id = $1`,
        [id, status],
    );
}

export async function markInProgress(id: string): Promise<void> {
    await pool.query(
        `
        UPDATE videos
        SET status = 'IN_PROGRESS',
            in_progress_at = NOW(),
            status_updated_at = NOW(),
            last_error = NULL,
            last_error_at = NULL,
            last_error_stage = NULL,
            next_retry_at = NULL
        WHERE id = $1
        `,
        [id],
    );
}

export async function markFailed(
    id: string,
    stage: string,
    error: string,
    baseDelayMinutes = 30,
): Promise<void> {
    await pool.query(
        `
        UPDATE videos
        SET status = 'FAILED',
            last_error = $2,
            last_error_stage = $3,
            last_error_at = NOW(),
            retry_count = COALESCE(retry_count, 0) + 1,
            next_retry_at = NOW() + (interval '1 minute' * ($4 * power(2, COALESCE(retry_count, 0)))),
            status_updated_at = NOW()
        WHERE id = $1
        `,
        [id, error.slice(0, 1000), stage, baseDelayMinutes],
    );
}

export async function markTranscribed(id: string): Promise<void> {
    await pool.query(
        `
        UPDATE videos
        SET status = 'TRANSCRIBED',
            transcribed_at = NOW(),
            status_updated_at = NOW(),
            next_retry_at = NULL
        WHERE id = $1
        `,
        [id],
    );
}

export async function resetStaleInProgress(
    source: string,
    staleMinutes = 120,
): Promise<number> {
    const result = await pool.query(
        `
        UPDATE videos
        SET status = 'TO_BE_TRANSCRIBE',
            status_updated_at = NOW()
        WHERE source = $1
          AND status = 'IN_PROGRESS'
          AND (status_updated_at IS NULL OR status_updated_at < NOW() - ($2 || ' minutes')::interval)
        `,
        [source, staleMinutes],
    );
    return result.rowCount ?? 0;
}

export async function listVideosAndIds(source: string): Promise<{
    videos: VideoRecord[];
    ids: Set<string>;
}> {
    const result = await pool.query(
        `SELECT id, source, name, status, original_date, next_retry_at
         FROM videos
         WHERE source = $1
         ORDER BY created_at DESC`,
        [source],
    );
    const videos = result.rows.map((row) => ({
        id: row.id,
        source: row.source,
        name: row.name,
        status: row.status,
        original_date: row.original_date,
        next_retry_at: row.next_retry_at,
    }));
    return { videos, ids: new Set(videos.map((vid) => vid.id)) };
}
