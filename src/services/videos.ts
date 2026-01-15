import { pool } from "../db";

export type VideoRecord = {
    id: string;
    source?: string | null;
    name?: string | null;
    status?: string | null;
    original_date?: Date | string | null;
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
        `SELECT id, source, name, status, original_date
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
    }));
    return { videos, ids: new Set(videos.map((vid) => vid.id)) };
}

export function getVideosToTranscribe(
    DBvideos: VideoRecord[],
    latestVideosFetch: VideoRecord[],
    idsInDb?: Set<string>,
): VideoRecord[] {
    const ids = idsInDb ?? new Set(DBvideos.map((vid) => vid.id));

    const videosToTranscribe = DBvideos
        .filter((vid) => vid.status !== "TRANSCRIBED" && vid.status !== 'IN_PROGRESS')
        .concat(latestVideosFetch.filter((vid) => !ids.has(vid.id)));
    return videosToTranscribe
}
