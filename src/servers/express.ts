import express, { Request, Response, NextFunction } from "express"
import cors from "cors"

export function runExpressApp() {
  const app = express()
  app.use(express.json())
  app.use(express.static(__dirname))
  app.use(
    cors({
      origin: "*",
    }),
  )
  app.use(express.static("app"))
  app.use(
    (
      error: Record<string, any>,
      req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (error) {
        console.warn("Express app error,", error.message)
        error.status = error.status || (error.name === "TypeError" ? 400 : 500)
        res.statusMessage = error.message
        res.status(error.status).send(String(error))
      } else {
        next()
      }
    },
  )

  return app
}
