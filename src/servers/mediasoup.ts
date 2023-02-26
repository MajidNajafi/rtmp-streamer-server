import * as mediasoup from "mediasoup"
import { AppConfig } from "../config"

export async function runMediasoupWorker() {
  const config = AppConfig.getInstance().config

  const mediaWorker = await mediasoup.createWorker({
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags,
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
  })

  mediaWorker.on("died", () => {
    console.error(
      "mediasoup worker died, exiting in 2 seconds... [pid:%d]",
      mediaWorker.pid,
    )
    setTimeout(() => process.exit(1), 2000)
  })
  const mediaCodecs = config.mediasoup.router.mediaCodecs
  const mediaRouter = await mediaWorker.createRouter({ mediaCodecs })

  return { mediaWorker, mediaRouter }
}
