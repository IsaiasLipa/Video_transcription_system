import type { VideoRecord } from "../services/videos";

function isReadyForRetry(vid: VideoRecord, now: Date): boolean {
  if (!vid.next_retry_at) return true;
  const retryAt = vid.next_retry_at instanceof Date ? vid.next_retry_at : new Date(vid.next_retry_at);
  return Number.isNaN(retryAt.getTime()) || retryAt <= now;
}

export function getVideosToTranscribe(
  dbVideos: VideoRecord[],
  latestVideosFetch: VideoRecord[],
  idsInDb?: Set<string>,
  now: Date = new Date(),
): VideoRecord[] {
  const ids = idsInDb ?? new Set(dbVideos.map((vid) => vid.id));

  return dbVideos
    .filter((vid) => vid.status !== "TRANSCRIBED" && vid.status !== "IN_PROGRESS")
    .filter((vid) => isReadyForRetry(vid, now))
    .concat(latestVideosFetch.filter((vid) => !ids.has(vid.id)));
}
