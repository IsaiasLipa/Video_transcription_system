//scrapte/fetch Senate Videos

const DEFAULT_COLLECTION_ID = "61b3adc8124d7d000891ca5c";
const API_URL = "https://tf4pr3wftk.execute-api.us-west-2.amazonaws.com/default/api/all";
const DEFAULT_PAGE = 1;
const DEFAULT_RESULTS = 10;

import path from "path";
import fs from "node:fs";
import { pipeline } from "stream/promises";
import { transcribeVideo } from "../transcription/videoTranscription";
import { listVideos, upsertVideo, updateVideoStatus, VideoRecord, getVideosToTranscribe} from "../services/videos";
import { createTranscript } from "../services/transcripts";

export interface RawVideo {
    original_date: string,
    _id: string;
    metadata: {
        filename?: string;
        duration?: string | number;
        description?: string;

        // allow extra metadata keys
        [key: string]: unknown;
    };
}
export interface RawVideoResponse {
    record: number;
    count: number;
    allFiles: RawVideo[]
}


// returns the JSON objects of the seante videos
export async function fetchSenateVideoObjects(
    collectionId = DEFAULT_COLLECTION_ID,
): Promise<VideoRecord[]> {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            _id: collectionId,
            page: DEFAULT_PAGE,
            results: DEFAULT_RESULTS,
        }),
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as RawVideoResponse;
    const videoObjects: VideoRecord[] = [];
    data.allFiles.forEach((vid) => videoObjects.push({
        id: vid._id,
        source: "SENATE",
        name: vid.metadata.filename ?? null,
        status: "NEW",
        original_date: vid.original_date ?? null,
    }));;
    return videoObjects
}

// dowloadsVideo file using the _id obtain from the fetchSenateVideoObjects()
export async function dowloadVideo(id: string): Promise<string> {
    const url = `https://dlttx48mxf9m3.cloudfront.net/outputs/${id}/Default/MP4/out_1080.mp4`;

    const dir = path.join(process.cwd(), "videos");
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${id}.mp4`);

    const exists = fs.existsSync(filePath);
    if (exists) {
        console.log('file already dowloaded')
        return filePath
    }

    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Failed to download video: ${res.status} ${res.statusText}`);
    }



    await pipeline(
        res.body as any,
        fs.createWriteStream(filePath)
    );

    //console.log(`Saved video to ${filePath}`);
    return filePath
}

// export function getVideosToTranscribe(
//     recentDBVideos: VideoRecord[],
//     lastSenateVideos: RawVideo[],
// ): VideoRecord[] {
//     const idsInDb = new Set(recentDBVideos.map((vid) => vid.id));

//     const videosInDBNotTranscribed = recentDBVideos.filter(
//         (vid) => vid.status === "TO BE TRANSCRIBE" || "FAILED",
//     );

//     const videosNotInDB = lastSenateVideos
//         .filter((vid) => !idsInDb.has(vid._id))
//         .map((vid) => ({
//             id: vid._id,
//             source: "SENATE",
//             name: vid.metadata.filename ?? null,
//             status: "NEW",
//             original_date: vid.original_date ?? null,
//         }));

//     return videosInDBNotTranscribed.concat(videosNotInDB);
// }



export async function getSenateVideos() {
    const recentDBSenateVideos = await listVideos('SENATE');

    const lastSenateVideos = await fetchSenateVideoObjects();

    const videosToTranscribe = getVideosToTranscribe(recentDBSenateVideos, lastSenateVideos)

    for (const vid of videosToTranscribe) {
        if (vid.status == 'NEW') {
            await upsertVideo({
                id: vid.id,
                source: vid.source,
                name: vid.name,
                status: "TO BE TRANSCRIBE",
                original_date: vid.original_date,
            });
        }
    }

    for (const video of videosToTranscribe) {
        try {
            const videoPath = await dowloadVideo(video.id);
            console.log(videoPath)
            const transcript = await transcribeVideo(videoPath);
            console.log(transcript)
            await createTranscript({ videoId: video.id, transcript });
            await updateVideoStatus(video.id, "TRANSCRIBED");
        } catch (error) {
            console.error(`Failed processing video ${video.id}`, error);
            await updateVideoStatus(video.id, "FAILED");
        }
    }

}
