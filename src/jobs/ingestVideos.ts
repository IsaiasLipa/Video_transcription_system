import { updateVideoStatus, VideoRecord } from "../services/videos";
import { fetchHouseVideoObject, downloadHouseVideo } from "../sources/house";
import { fetchSenateVideoObjects, downloadSenateVideo } from "../sources/senate";
import { getVideosToTranscribe, listVideosAndIds, resetStaleInProgress, upsertVideo } from "../services/videos";
import { transcribeVideo } from "../transcription/videoTranscription";
import { createTranscript } from "../services/transcripts";

type FetchFn = () => Promise<VideoRecord[]>;
type DownloadFn = (id: string) => Promise<string>;

async function ingestSource(
  source: "HOUSE" | "SENATE",
  fetchVideos: FetchFn,
  downloadVideo: DownloadFn,
) {
  await resetStaleInProgress(source);

  const { videos: dbVideos, ids: idsInDb } = await listVideosAndIds(source);
  const latest = await fetchVideos();

  const videosToTranscribe = getVideosToTranscribe(dbVideos, latest, idsInDb);
  const newVideos = latest.filter((vid) => !idsInDb.has(vid.id));

  for (const vid of newVideos) {
    await upsertVideo({ ...vid, status: "TO_BE_TRANSCRIBE" });
  }

  for (const video of videosToTranscribe) {
    try {
      await updateVideoStatus(video.id, "IN_PROGRESS");
      const path = await downloadVideo(video.id);
      const transcript = await transcribeVideo(path);
      await createTranscript({ videoId: video.id, transcript });
      await updateVideoStatus(video.id, "TRANSCRIBED");
    } catch (err) {
      console.error(`Failed processing video ${video.id}`, err);
      await updateVideoStatus(video.id, "FAILED");
    }
  }
}


export async function ingestVideos(): Promise<void> {
  await ingestSource('HOUSE', fetchHouseVideoObject, downloadHouseVideo);
  await ingestSource('SENATE', fetchSenateVideoObjects, downloadSenateVideo);
}
