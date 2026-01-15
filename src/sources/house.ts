// scrape/fetch House videos 
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { Agent, fetch } from "undici";
import { VideoRecord } from "../services/videos";
import { withRetry } from "../utils/retry";
import { isWithinLastMonth } from "../utils/date";
import { config } from "../config";

const ARCHIVE_URL =
    "https://house.mi.gov/VideoArchive?handler=ArchiveVideoPartial&Year=2025&Type=All&Date=";

const VIDEO_BASE =
    "https://www.house.mi.gov/ArchiveVideoFiles/";

const CA_CERT_PATH = config.houseCaBundlePath
    ? path.resolve(process.cwd(), config.houseCaBundlePath)
    : path.resolve(process.cwd(), "house.chain.pem");
let caCert: string | undefined;
if (fs.existsSync(CA_CERT_PATH)) {
    const raw = fs.readFileSync(CA_CERT_PATH, "utf-8");
    const matches = raw.match(/-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----/g);
    if (matches && matches.length > 1) {
        caCert = matches.slice(1).join("\n");
    } else {
        caCert = raw;
    }
}
const dispatcher = caCert ? new Agent({ connect: { ca: caCert } }) : undefined;

export async function fetchHouseVideoObject(): Promise<VideoRecord[]> {
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

export async function downloadHouseVideo(id: string):Promise<string> {
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
        Readable.fromWeb(res.body as unknown as WebReadableStream),
        fs.createWriteStream(filePath)
    );

    return filePath
}
