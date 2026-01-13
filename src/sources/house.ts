// scrape/fetch House videos 
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { Agent, fetch } from "undici";
import { getVideosToTranscribe, listVideoIds, listVideos, resetStaleInProgress, updateVideoStatus, upsertVideo } from "../services/videos";
import { VideoRecord } from "../services/videos";
import { createTranscript } from "../services/transcripts";
import { transcribeVideo } from "../transcription/videoTranscription";
import { withRetry } from "../utils/retry";
import { config } from "../config";
import { isWithinLastMonth } from "../utils/date";

const ARCHIVE_URL =
    "https://house.mi.gov/VideoArchive?handler=ArchiveVideoPartial&Year=2025&Type=All&Date=";

const VIDEO_BASE =
    "https://www.house.mi.gov/ArchiveVideoFiles/";

const dispatcher = config.insecureTls
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;

export async function fetchHouseVideoObject() {
    const res = await withRetry(
        () => (dispatcher ? fetch(ARCHIVE_URL, { dispatcher }) : fetch(ARCHIVE_URL)),
        { retries: 2, delayMs: 1000, factor: 2 },
    );

    if (!res.ok) {
        throw new Error(`Failed to fetch archive page: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const videoObjects: VideoRecord[] = [];

    $("a[href*='VideoArchivePlayer']").each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim(); // "Thursday, February 20, 2025"

        if (!href) return;

        // Extract filename from query param
        const match = href.match(/video=([^&]+)/);
        if (!match) return;

        const fileName = match[1]; // HAGRI-022025.mp4

        if (isWithinLastMonth(text)) {
            videoObjects.push({
                id: fileName,
                source: "HOUSE",
                name: fileName,
                status: "NEW",
                original_date: text,
            });

        }
    });

    return videoObjects;
}

export async function downloadVideo(id: string):Promise<string> {
    const url = `${VIDEO_BASE}${id}`
    const outputDir = "./videos"
    console.log(url)
    await fs.promises.mkdir(outputDir, { recursive: true });

    const fileName = path.basename(url);
    const filePath = path.join(outputDir, fileName);

    // Skip if already downloaded
    if (fs.existsSync(filePath)) {
        console.log(` Skipping (already exists): ${fileName}`);
        return filePath;
    }

    const res = await withRetry(
        () => (dispatcher ? fetch(url, { dispatcher }) : fetch(url)),
        { retries: 2, delayMs: 1000, factor: 2 },
    );

    if (!res.ok || !res.body) {
        throw new Error(`Failed to download ${url}`);
    }

    await pipeline(
        Readable.fromWeb(res.body),
        fs.createWriteStream(filePath)
    );

    return filePath
}

export async function getHouseVideos() {
    await resetStaleInProgress("HOUSE");
    const recentDBHouseVideos = await listVideos("HOUSE");
    const allHouseIds = await listVideoIds("HOUSE");
    const lastFetchedHouseVideos = await fetchHouseVideoObject();
    const videosToTranscribe = getVideosToTranscribe(
        recentDBHouseVideos,
        lastFetchedHouseVideos,
        new Set(allHouseIds),
    );
    const idsInDb = new Set(allHouseIds);
    const newVideos = lastFetchedHouseVideos.filter((vid) => !idsInDb.has(vid.id));
    for (const vid of newVideos) {
        await upsertVideo({
            id: vid.id,
            source: vid.source,
            name: vid.name,
            status: "TO BE TRANSCRIBE",
            original_date: vid.original_date,
        });
    }

    for (const video of videosToTranscribe) {
        try {
            await updateVideoStatus(video.id, "IN_PROGRESS");
            const videoPath = await downloadVideo(video.id);
            console.log(videoPath)
            const transcript = await transcribeVideo(videoPath);
            await createTranscript({ videoId: video.id, transcript });
            await updateVideoStatus(video.id, "TRANSCRIBED");
        } catch (error) {
            console.error(`Failed processing video ${video.id}`, error);
            await updateVideoStatus(video.id, "FAILED");
        }
    }
}
