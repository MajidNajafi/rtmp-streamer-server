import * as mediasoup from "mediasoup"

export const config = {
  server: {
    ip: "0.0.0.0",
    port: 3000,
    cert: "cert/fullchain.pem",
    certKey: "cert/privkey.pem",
    wsPingInterval: 25000,
    wsPingTimeout: 5000,
  },

  mediasoup: {
    // WorkerSettings
    worker: {
      logLevel: "debug" as mediasoup.types.WorkerLogLevel,
      logTags: [
        // "bwe",
        "dtls",
        "ice",
        "info",
        "rtcp",
        "rtp",
        // "rtx",
        // "score",
        // "sctp",
        // "simulcast",
        "srtp",
        // "svc"
      ] as mediasoup.types.WorkerLogTag[],
      rtcMinPort: 32256,
      rtcMaxPort: 65535,
    },

    // RouterOptions
    // -------
    // WARNING
    // These values MUST match those found in the input SDP file
    // -------
    router: {
      // RtpCodecCapability[]
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          preferredPayloadType: 111,
          clockRate: 48000,
          channels: 2,
          parameters: {
            minptime: 10,
            useinbandfec: 1,
          },
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          preferredPayloadType: 96,
          clockRate: 90000,
        },
        {
          kind: "video",
          mimeType: "video/H264",
          preferredPayloadType: 125,
          clockRate: 90000,
          parameters: {
            "level-asymmetry-allowed": 1,
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
          },
        },
      ] as mediasoup.types.RtpCodecCapability[],
    },

    // WebRtcTransportOptions
    webrtcTransport: {
      listenIps: [{ ip: "0.0.0.0", announcedIp: undefined }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 300000,
    },

    // PlainTransportOptions
    plainTransport: {
      listenIp: { ip: "0.0.0.0", announcedIp: undefined },
    },

    // Target IP and port for RTP streaming
    streaming: {
      ip: "0.0.0.0",
      audioPort: 5004,
      audioPortRtcp: 5005,
      videoPort: 5006,
      videoPortRtcp: 5007,
    },
  },
  rmtp: {
    input:
      "rtmp://push.ir-thr-mn-cluster.arvanlive.ir:1935/eO0kYzdvmJ/JBndAjq0QL",
  },
}
