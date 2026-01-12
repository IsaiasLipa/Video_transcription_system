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
    await pool.query(`UPDATE videos SET status = $2 WHERE id = $1`, [id, status]);
}

export function getVideosToTranscribe(DBvideos: VideoRecord[], latestVideosFetch: VideoRecord[]): VideoRecord[] {
    const idsInDb = new Set(DBvideos.map((vid) => vid.id));

    const videosToTranscribe = DBvideos
        .filter((vid) => vid.status !== "TRANSCRIBED")
        .concat(latestVideosFetch.filter((vid) => !idsInDb.has(vid.id)));
    return videosToTranscribe
}
