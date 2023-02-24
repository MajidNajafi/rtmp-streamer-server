import fs from "fs"
import http, { Server } from "http"
import { Express } from "express"
import { config } from "../config"

export async function runWebServer(expressApp: Express): Promise<Server> {
  const { certKey, cert } = config.server

  if (!fs.existsSync(certKey) || !fs.existsSync(cert)) {
    console.error("SSL files are not found. check your config.js file")
    process.exit(0)
  }

  const webServer = http.createServer(expressApp)

  webServer.on("error", (err) => {
    console.error("HTTP error:", err.message)
  })

  return new Promise((resolve) => {
    const { ip, port } = config.server
    webServer.listen(port, ip, () => {
      const listenIps = config.mediasoup.webrtcTransport.listenIps[0]
      console.log(`server is running on port ${port}`)
      resolve(webServer)
    })
  })
}
