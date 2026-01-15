import { describe, expect, it } from "vitest";
import { getVideosToTranscribe } from "../src/utils/videoSelection";
import type { VideoRecord } from "../src/services/videos";

describe("getVideosToTranscribe", () => {
  it("keeps non-transcribed db rows and adds new fetched rows", () => {
    const dbVideos: VideoRecord[] = [
      { id: "A", status: "NEW" },
      { id: "B", status: "IN_PROGRESS" },
      { id: "C", status: "TRANSCRIBED" },
      { id: "D", status: "FAILED" },
    ];

    const fetched: VideoRecord[] = [
      { id: "A", status: "NEW" },
      { id: "E", status: "NEW" },
    ];

    const result = getVideosToTranscribe(dbVideos, fetched);
    const ids = result.map((item) => item.id).sort();

    expect(ids).toEqual(["A", "D", "E"].sort());
  });

  it("respects provided idsInDb when filtering fetched videos", () => {
    const dbVideos: VideoRecord[] = [{ id: "A", status: "NEW" }];
    const fetched: VideoRecord[] = [{ id: "B", status: "NEW" }];
    const idsInDb = new Set<string>(["B"]);

    const result = getVideosToTranscribe(dbVideos, fetched, idsInDb);
    expect(result.map((item) => item.id)).toEqual(["A"]);
  });
});
