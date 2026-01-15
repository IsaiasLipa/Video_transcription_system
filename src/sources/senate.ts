//scrapte/fetch Senate Videos
import path from "path";
import fs from "node:fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { VideoRecord } from "../services/videos";
import { withRetry } from "../utils/retry";
import { isWithinLastMonth } from "../utils/date";

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

const DEFAULT_COLLECTION_ID = "61b3adc8124d7d000891ca5c";
const API_URL = "https://tf4pr3wftk.execute-api.us-west-2.amazonaws.com/default/api/all";


async function fetchSetOfVideoObjects(
    page: number,
    result: number,
    collectionId = DEFAULT_COLLECTION_ID,
): Promise<VideoRecord[]> {
    const response = await withRetry(
        () =>
            fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    _id: collectionId,
                    page: page,
                    results: result,
                }),
            }),
        { retries: 2, delayMs: 1000, factor: 2 },
    );
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

// returns the JSON objects of the seante videos
export async function fetchSenateVideoObjects(): Promise<VideoRecord[]> {
    let page = 1;
    const result = 10;
    const videoObjects = await fetchSetOfVideoObjects(page, result);
    
    // sort objects by original_date 
    videoObjects.sort((a, b) => {
        const aTime = a.original_date ? new Date(a.original_date).getTime() : 0;
        const bTime = b.original_date ? new Date(b.original_date).getTime() : 0;
        return aTime - bTime; 
    });

    while (
        videoObjects.length > 0 &&
        isWithinLastMonth(videoObjects[videoObjects.length - 1].original_date)
    ) {
        page += 1;
        const newVideoObjects = await fetchSetOfVideoObjects(page, result);
        if (newVideoObjects.length === 0) {
            break;
        }
        videoObjects.concat(newVideoObjects);
    }

    return videoObjects;

}

// dowloadsVideo file using the _id obtain from the fetchSenateVideoObjects()
export async function downloadSenateVideo(id: string): Promise<string> {
    const url = `https://dlttx48mxf9m3.cloudfront.net/outputs/${id}/Default/MP4/out_1080.mp4`;

    const dir = path.join(process.cwd(), "videos");
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${id}.mp4`);

    const exists = fs.existsSync(filePath);
    if (exists) {
        return filePath
    }

    const res = await withRetry(() => fetch(url), { retries: 2, delayMs: 1000, factor: 2 });

    if (!res.ok || !res.body) {
        throw new Error(`Failed to download video: ${res.status} ${res.statusText}`);
    }

    await pipeline(
        Readable.fromWeb(res.body as unknown as WebReadableStream),
        fs.createWriteStream(filePath)
    );

    return filePath
}
