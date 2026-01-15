import type { VideoRecord } from "../services/videos";

export function getVideosToTranscribe(
  dbVideos: VideoRecord[],
  latestVideosFetch: VideoRecord[],
  idsInDb?: Set<string>,
): VideoRecord[] {
  const ids = idsInDb ?? new Set(dbVideos.map((vid) => vid.id));

  return dbVideos
    .filter((vid) => vid.status !== "TRANSCRIBED" && vid.status !== "IN_PROGRESS")
    .concat(latestVideosFetch.filter((vid) => !ids.has(vid.id)));
}
