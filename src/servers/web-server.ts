import fs from "fs"
import https, { Server } from "https"
import { Express } from "express"
import { AppConfig } from "../config"

export async function runWebServer(expressApp: Express): Promise<Server> {
  const config = AppConfig.getInstance().config

  const { certKey, cert } = config.server

  if (!fs.existsSync(certKey) || !fs.existsSync(cert)) {
    console.error("SSL files are not found. check your config.js file")
    process.exit(0)
  }

  const tls = {
    cert: fs.readFileSync(cert),
    key: fs.readFileSync(certKey),
  }

  const webServer = https.createServer(tls, expressApp)

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
