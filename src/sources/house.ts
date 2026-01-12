// scrape/fetch House videos 
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Agent, fetch } from "undici";
import { getVideosToTranscribe, listVideos, updateVideoStatus, upsertVideo } from "../services/videos";
import { VideoRecord } from "../services/videos";
import { createTranscript } from "../services/transcripts";
import { transcribeVideo } from "../transcription/videoTranscription";


const ARCHIVE_URL =
    "https://house.mi.gov/VideoArchive?handler=ArchiveVideoPartial&Year=2025&Type=All&Date=";

const VIDEO_BASE =
    "https://www.house.mi.gov/ArchiveVideoFiles/";

const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

function isWithinLastMonth(date: Date) {
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1);
    return date >= oneMonthAgo;
}

export async function fetchHouseVideoObject() {
    const res = await fetch(ARCHIVE_URL, { dispatcher });

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

        // Parse date
        const parsedDate = new Date(text);
        if (isNaN(parsedDate.getTime())) return;

        if (isWithinLastMonth(parsedDate)) {
            videoObjects.push({
                id: fileName,
                source: "HOUSE",
                name: fileName,
                status: "NEW",
                original_date: parsedDate,
            });

        }
    });

    return videoObjects;
}

export async function dowloadVideo(id: string):Promise<string> {
    const url = `${VIDEO_BASE}${id}`
    const outputDir = "./videos"
    console.log(url)
    await fs.promises.mkdir(outputDir, { recursive: true });

    const fileName = path.basename(url);
    const filePath = path.join(outputDir, fileName);

    // Skip if already downloaded
    if (fs.existsSync(filePath)) {
        console.log(`⏭️  Skipping (already exists): ${fileName}`);
        return filePath;
    }

    console.log(`⬇️  Downloading: ${fileName}`);

    const res = await fetch(url, { dispatcher });

    if (!res.ok || !res.body) {
        throw new Error(`Failed to download ${url}`);
    }

    await pipeline(
        res.body,
        fs.createWriteStream(filePath)
    );

    return filePath
}

export async function getHouseVideo() {
    const recentDBHouseVideos = await listVideos('HOUSE');
    const lastFetchedHouseVideos = await fetchHouseVideoObject();
    const videosToTranscribe = getVideosToTranscribe(recentDBHouseVideos,lastFetchedHouseVideos);
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
