import * as mediasoup from "mediasoup"
import { Server } from "socket.io"
import FFmpegStatic from "ffmpeg-static"
import Process, { execSync } from "child_process"
import { runExpressApp } from "./servers/express"
import { runWebServer } from "./servers/web-server"
import { runSocketServer } from "./servers/socket"
import { AppConfig } from "./config"

const currentDirectory = __dirname.split("/")
currentDirectory.pop()
const rootDir = currentDirectory.join("/")

let config

let worker: mediasoup.types.Worker
let webServer
let socketServer: Server
let expressApp

let mediasoupRouter: mediasoup.types.Router

let webrtcAudioProducer: mediasoup.types.Producer
let webrtcVideoProducer: mediasoup.types.Producer
let webrtcRecvTransport: mediasoup.types.Transport

let rtpAudioTransport: mediasoup.types.Transport
let rtpAudioConsumer: mediasoup.types.Consumer
let rtpVideoTransport: mediasoup.types.Transport
let rtpVideoConsumer: mediasoup.types.Consumer
let streamProcess: Process.ChildProcessWithoutNullStreams | null

  // run servers
;(async () => {
  try {
    const cmd = `curl icanhazip.com || printf "0.0.0.0"`
    const ip = execSync(cmd).toString().trim()
    console.log({ ip })
    config = AppConfig.getInstance(ip).config
    expressApp = runExpressApp()
    webServer = await runWebServer(expressApp)
    socketServer = await runSocketServer(
      webServer,
      handleRequest,
      handleWebrtcRecvConnect,
      handleWebrtcRecvProduce,
      handleStartStreaming,
      handleStopStreaming,
    )

    expressApp.get("/restart_server", (req, res) => {
      res.send("restart command executed")
      restartServer()
    })
  } catch (err) {
    console.error(err)
  }
})()

// ----

async function handleRequest(request: any, callback: any) {
  let responseData = null

  switch (request.type) {
    case "START_MEDIASOUP":
      responseData = await handleStartMediasoup(request.vCodecName)
      break
    case "WEBRTC_RECV_START":
      responseData = await handleWebrtcRecvStart()
      break
    default:
      console.warn("Invalid request type:", request.type)
      break
  }

  callback({ type: request.type, data: responseData })
}

// ----------------------------------------------------------------------------

// Util functions
// ==============

function audioEnabled() {
  return webrtcAudioProducer !== null
}

function videoEnabled() {
  return webrtcVideoProducer !== null
}

function h264Enabled() {
  const codec = mediasoupRouter.rtpCapabilities?.codecs?.find(
    (c) => c.mimeType === "video/H264",
  )
  return codec !== undefined
}

// ----------------------------------------------------------------------------

/*
 * Creates a mediasoup worker and router.
 */
async function handleStartMediasoup(vCodecName: "VP8" | "H264") {
  worker = await mediasoup.createWorker(config.mediasoup.worker)

  worker.on("died", () => {
    console.error(
      "mediasoup worker died, exit in 3 seconds... [pid:%d]",
      worker.pid,
    )
    setTimeout(() => process.exit(1), 3000)
  })

  console.log("mediasoup worker created [pid:%d]", worker.pid)

  // Build a RouterOptions based on 'config.mediasoup.router' and the
  // requested 'vCodecName'
  const routerOptions = {
    mediaCodecs: [] as mediasoup.types.RtpCodecCapability[],
  }

  const audioCodec = config.mediasoup.router.mediaCodecs.find(
    (c) => c.mimeType === "audio/opus",
  )
  if (!audioCodec) {
    console.error("Undefined codec mime type: audio/opus -- Check config.js")
    process.exit(1)
  }
  routerOptions.mediaCodecs.push(audioCodec)

  const videoCodec = config.mediasoup.router.mediaCodecs.find(
    (c) => c.mimeType === `video/${vCodecName}`,
  )
  if (!videoCodec) {
    console.error(
      `Undefined codec mime type: video/${vCodecName} -- Check config.js`,
    )
    process.exit(1)
  }
  routerOptions.mediaCodecs.push(videoCodec)

  try {
    mediasoupRouter = await worker.createRouter(routerOptions)
  } catch (err) {
    console.error("BUG:", err)
    process.exit(1)
  }

  // At this point, the computed "router.rtpCapabilities" includes the
  // router codecs enhanced with retransmission and RTCP capabilities,
  // and the list of RTP header extensions supported by mediasoup.

  console.log("mediasoup router created")

  console.log(
    "mediasoup router RtpCapabilities:\n%O",
    mediasoupRouter.rtpCapabilities,
  )

  return mediasoupRouter.rtpCapabilities
}

// ----------------------------------------------------------------------------

// Creates a mediasoup WebRTC RECV transport

async function handleWebrtcRecvStart() {
  const router = mediasoupRouter

  const transport = await router.createWebRtcTransport({
    listenIps: config.mediasoup.webrtcTransport.listenIps,
    enableUdp: config.mediasoup.webrtcTransport.enableUdp,
    enableTcp: config.mediasoup.webrtcTransport.enableTcp,
    preferUdp: config.mediasoup.webrtcTransport.preferUdp,
    initialAvailableOutgoingBitrate:
      config.mediasoup.webrtcTransport.initialAvailableOutgoingBitrate,
  })
  webrtcRecvTransport = transport

  console.log("mediasoup WebRTC RECV transport created")

  const webrtcTransportOptions = {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    sctpParameters: transport.sctpParameters,
  }

  console.log(
    "mediasoup WebRTC RECV TransportOptions:\n%O",
    webrtcTransportOptions,
  )

  return webrtcTransportOptions
}

// ----------------------------------------------------------------------------

// Calls WebRtcTransport.connect() whenever the browser client part is ready

async function handleWebrtcRecvConnect(dtlsParameters: any) {
  await webrtcRecvTransport.connect({ dtlsParameters })
  console.log("mediasoup WebRTC RECV transport connected")
}

// ----------------------------------------------------------------------------

// Calls WebRtcTransport.produce() to start receiving media from the browser

async function handleWebrtcRecvProduce(produceParameters: any, callback: any) {
  const producer = await webrtcRecvTransport.produce(produceParameters)
  switch (producer.kind) {
    case "audio":
      webrtcAudioProducer = producer
      break
    case "video":
      webrtcVideoProducer = producer
      break
  }

  socketServer.emit("WEBRTC_RECV_PRODUCER_READY", producer.kind)

  console.log(
    "mediasoup WebRTC RECV producer created, kind: %s, type: %s, paused: %s",
    producer.kind,
    producer.type,
    producer.paused,
  )

  console.log(
    "mediasoup WebRTC RECV producer RtpParameters:\n%O",
    producer.rtpParameters,
  )

  callback(producer.id)
}

// ----------------------------------------------------------------------------

async function handleStartStreaming(
  streamer = "ffmpeg",
  rtmpServer = config.rmtp.input,
) {
  const router = mediasoupRouter

  const useAudio = audioEnabled()
  const useVideo = videoEnabled()

  // Start mediasoup's RTP consumer(s)

  if (useAudio) {
    const rtpTransport = await router.createPlainTransport({
      // No RTP will be received from the remote side
      comedia: false,
      // FFmpeg and GStreamer don't support RTP/RTCP multiplexing ("a=rtcp-mux" in SDP)
      rtcpMux: false,

      listenIp: config.mediasoup.plainTransport.listenIp,
    })
    rtpAudioTransport = rtpTransport

    await rtpTransport.connect({
      ip: config.mediasoup.streaming.ip,
      port: config.mediasoup.streaming.audioPort,
      rtcpPort: config.mediasoup.streaming.audioPortRtcp,
    })

    console.log(
      "mediasoup AUDIO RTP SEND transport connected: %s:%d <--> %s:%d (%s)",
      rtpTransport.tuple.localIp,
      rtpTransport.tuple.localPort,
      rtpTransport.tuple.remoteIp,
      rtpTransport.tuple.remotePort,
      rtpTransport.tuple.protocol,
    )

    console.log(
      "mediasoup AUDIO RTCP SEND transport connected: %s:%d <--> %s:%d (%s)",
      rtpTransport.rtcpTuple?.localIp,
      rtpTransport.rtcpTuple?.localPort,
      rtpTransport.rtcpTuple?.remoteIp,
      rtpTransport.rtcpTuple?.remotePort,
      rtpTransport.rtcpTuple?.protocol,
    )

    const rtpConsumer = await rtpTransport.consume({
      producerId: webrtcAudioProducer.id,
      rtpCapabilities: router.rtpCapabilities, // Assume the streamer supports same formats as mediasoup's router
      paused: true,
    })
    rtpAudioConsumer = rtpConsumer

    console.log(
      "mediasoup AUDIO RTP SEND consumer created, kind: %s, type: %s, paused: %s, SSRC: %s CNAME: %s",
      rtpConsumer.kind,
      rtpConsumer.type,
      rtpConsumer.paused,
      rtpConsumer.rtpParameters.encodings?.[0].ssrc,
      rtpConsumer.rtpParameters.rtcp?.cname,
    )
  }

  if (useVideo) {
    const rtpTransport = await router.createPlainTransport({
      // No RTP will be received from the remote side
      comedia: false,

      // FFmpeg and GStreamer don't support RTP/RTCP multiplexing ("a=rtcp-mux" in SDP)
      rtcpMux: false,

      ...config.mediasoup.plainTransport,
    })
    rtpVideoTransport = rtpTransport

    await rtpTransport.connect({
      ip: config.mediasoup.streaming.ip,
      port: config.mediasoup.streaming.videoPort,
      rtcpPort: config.mediasoup.streaming.videoPortRtcp,
    })

    console.log(
      "mediasoup VIDEO RTP SEND transport connected: %s:%d <--> %s:%d (%s)",
      rtpTransport.tuple.localIp,
      rtpTransport.tuple.localPort,
      rtpTransport.tuple.remoteIp,
      rtpTransport.tuple.remotePort,
      rtpTransport.tuple.protocol,
    )

    console.log(
      "mediasoup VIDEO RTCP SEND transport connected: %s:%d <--> %s:%d (%s)",
      rtpTransport.rtcpTuple?.localIp,
      rtpTransport.rtcpTuple?.localPort,
      rtpTransport.rtcpTuple?.remoteIp,
      rtpTransport.rtcpTuple?.remotePort,
      rtpTransport.rtcpTuple?.protocol,
    )

    const rtpConsumer = await rtpTransport.consume({
      producerId: webrtcVideoProducer.id,
      rtpCapabilities: router.rtpCapabilities, // Assume the streamer supports same formats as mediasoup's router
      paused: true,
    })
    rtpVideoConsumer = rtpConsumer

    console.log(
      "mediasoup VIDEO RTP SEND consumer created, kind: %s, type: %s, paused: %s, SSRC: %s CNAME: %s",
      rtpConsumer.kind,
      rtpConsumer.type,
      rtpConsumer.paused,
      rtpConsumer.rtpParameters.encodings?.[0].ssrc,
      rtpConsumer.rtpParameters.rtcp?.cname,
    )
  }

  // ----

  await startStreaming(rtmpServer)

  if (useAudio) {
    const consumer = rtpAudioConsumer
    console.log(
      "Resume mediasoup RTP consumer, kind: %s, type: %s",
      consumer.kind,
      consumer.type,
    )
    consumer.resume()
  }
  if (useVideo) {
    const consumer = rtpVideoConsumer
    console.log(
      "Resume mediasoup RTP consumer, kind: %s, type: %s",
      consumer.kind,
      consumer.type,
    )
    consumer.resume()
  }
}

// ----

// FFmpeg Streamer
function startStreaming(rtmpServer) {
  // Return a Promise that can be awaited
  let recResolve: any
  const promise = new Promise((res, _rej) => {
    recResolve = res
  })

  const useAudio = audioEnabled()
  const useVideo = videoEnabled()
  const useH264 = h264Enabled()

  // const cmdProgram = "ffmpeg"; // Found through $PATH
  const cmdProgram = FFmpegStatic // From package "ffmpeg-static"

  let cmdInputPath = `${rootDir}/sdp/vp8.sdp`

  // Ensure correct FFmpeg version is installed
  const ffmpegOut = Process.execSync(cmdProgram + " -version", {
    encoding: "utf8",
  })
  const ffmpegVerMatch = /ffmpeg version (\d+)\.(\d+)\.(\d+)/.exec(ffmpegOut)
  let ffmpegOk = false
  if (ffmpegOut.startsWith("ffmpeg version git")) {
    // Accept any Git build (it's up to the developer to ensure that a recent
    // enough version of the FFmpeg source code has been built)
    ffmpegOk = true
  } else if (ffmpegVerMatch) {
    const ffmpegVerMajor = parseInt(ffmpegVerMatch[1], 10)
    if (ffmpegVerMajor >= 4) {
      ffmpegOk = true
    }
  }

  if (!ffmpegOk) {
    console.error("FFmpeg >= 4.0.0 not found in $PATH; please install it")
    process.exit(1)
  }

  if (useVideo) {
    if (useH264) {
      cmdInputPath = `${rootDir}/sdp/h264.sdp`
    }
  }

  // Run process
  const cmdArgStr = [
    "-nostdin",
    "-protocol_whitelist file,rtp,udp",
    "-fflags +genpts",
    `-i ${cmdInputPath}`,
    "-acodec aac -vcodec libx264 -preset ultrafast -tune zerolatency",
    "-f flv",
    rtmpServer,
  ]
    .join(" ")
    .trim()

  console.log(`Run command: ${cmdProgram} ${cmdArgStr}`)

  streamProcess = Process.spawn("ffmpeg", cmdArgStr.split(/\s+/))

  streamProcess.on("error", (err) => {
    console.error("Streaming process error:", err)
  })

  streamProcess.on("exit", (code, signal) => {
    console.log("Streaming process exit, code: %d, signal: %s", code, signal)

    streamProcess = null
    stopMediasoupRtp()

    if (!signal || signal === "SIGINT") {
      console.log("Streaming stopped")
    } else {
      console.warn(
        "Streaming process didn't exit cleanly, output file might be corrupt",
      )
    }
  })

  // FFmpeg writes its logs to stderr
  streamProcess.stderr.on("data", (chunk) => {
    chunk
      .toString()
      .split(/\r?\n/g)
      .filter(Boolean) // Filter out empty strings
      .forEach((line: string) => {
        console.log(line)
        if (line.startsWith("ffmpeg version")) {
          setTimeout(() => {
            recResolve()
          }, 1000)
        }
      })
  })

  return promise
}

// ----------------------------------------------------------------------------

async function handleStopStreaming() {
  if (streamProcess) {
    streamProcess.kill("SIGINT")
  } else {
    stopMediasoupRtp()
  }
}

// ----

function stopMediasoupRtp() {
  console.log("Stop mediasoup RTP transport and consumer")

  const useAudio = audioEnabled()
  const useVideo = videoEnabled()

  if (useAudio) {
    rtpAudioConsumer?.close()
    rtpAudioTransport?.close()
  }

  if (useVideo) {
    rtpVideoConsumer?.close()
    rtpVideoTransport?.close()
  }
}

// ----------------------------------------------------------------------------

function restartServer() {
  const cmd = "pm2 restart app"
  execSync(cmd)
}
