import { Server } from "http"
import { Server as IO } from "socket.io"

export async function runSocketServer(
  webServer: Server,
  handleRequest: (...args: any[]) => void,
  handleWebrtcRecvConnect: (...args: any[]) => void,
  handleWebrtcRecvProduce: (...args: any[]) => void,
  handleStartStreaming: (...args: any[]) => void,
  handleStopStreaming: (...args: any[]) => void,
) {
  const socket = new IO(webServer, {
    cors: {
      origin: "*",
    },
  })

  // Events sent by the client's "socket.io-promise" have the fixed name
  // "request", and a field "type" that we use as identifier
  socket.on("request", handleRequest)

  // Events sent by the client's "socket.io-client" have a name
  // that we use as identifier
  socket.on("WEBRTC_RECV_CONNECT", handleWebrtcRecvConnect)
  socket.on("WEBRTC_RECV_PRODUCE", handleWebrtcRecvProduce)
  socket.on("START_RECORDING", handleStartStreaming)
  socket.on("STOP_RECORDING", handleStopStreaming)

  return socket
}
