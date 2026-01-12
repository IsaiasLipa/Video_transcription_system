// Hosted Whisper transcription via OpenAI API
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";

import { config } from "../config";
import { withRetry } from "../utils/retry";
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
const CHUNK_SECONDS = 900;

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

async function extractAudioToTempFile(videoPath: string, stem: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `${stem}-${Date.now()}.mp3`);
  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-acodec",
      "mp3",
      "-b:a",
      "128k",
      tempPath,
    ]);

    if (ffmpeg.stderr) {
      ffmpeg.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    ffmpeg.on("error", (error) => reject(error));
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const message = stderr.trim() || `ffmpeg exited with code ${code}`;
        reject(new Error(message));
      }
    });
  });
  return tempPath;
}

async function runWhisper(audioPath: string): Promise<string> {
  const response = await withRetry(
    () =>
      openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
      }),
    { retries: 2, delayMs: 1500, factor: 2 },
  );
  return response.text;
}

async function splitAudioIfNeeded(
  audioPath: string,
  stem: string,
): Promise<{ chunks: string[]; tempDir?: string }> {
  const stats = await fs.promises.stat(audioPath);
  if (stats.size <= MAX_UPLOAD_BYTES) {
    return { chunks: [audioPath] };
  }

  const chunkDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `${stem}-chunks-`));
  const pattern = path.join(chunkDir, `${stem}-%03d.mp3`);

  await new Promise<void>((resolve, reject) => {
    let stderr = "";
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(CHUNK_SECONDS),
      "-c",
      "copy",
      pattern,
    ]);

    if (ffmpeg.stderr) {
      ffmpeg.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    ffmpeg.on("error", (error) => reject(error));
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const message = stderr.trim() || `ffmpeg exited with code ${code}`;
        reject(new Error(message));
      }
    });
  });

  const entries = await fs.promises.readdir(chunkDir);
  const chunks = entries
    .filter((name) => name.endsWith(".mp3"))
    .sort()
    .map((name) => path.join(chunkDir, name));
  return { chunks, tempDir: chunkDir };
}

export async function transcribeVideo(source: string): Promise<string> {
  const stem = path.parse(source).name;
  const audioPath = await extractAudioToTempFile(source, stem);
  const outputDir = path.resolve(process.cwd(), "transcripts");
  await fs.promises.mkdir(outputDir, { recursive: true });
  let tempDir: string | undefined;
  try {
    const split = await splitAudioIfNeeded(audioPath, stem);
    tempDir = split.tempDir;
    console.log(tempDir)
    const chunks = split.chunks;
    console.log(chunks)
    let fullText = "";
    for (const chunkPath of chunks) {
      const chunkText = await runWhisper(chunkPath);
      fullText += `${chunkText}\n\n`;
    }
    const finalPath = path.join(outputDir, `${stem}.txt`);
    await fs.promises.writeFile(finalPath, fullText.trim(), "utf-8");
    return fullText.trim();
  } finally {
    if (fs.existsSync(audioPath)) {
      await fs.promises.unlink(audioPath);
    }
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }
}
