import { getHouseVideo } from "../sources/house";
import { getSenateVideos } from "../sources/senate";

export async function ingestVideos(): Promise<void> {
  await getHouseVideo();
  await getSenateVideos();
}
