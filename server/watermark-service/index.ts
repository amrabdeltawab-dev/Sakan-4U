import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createSakenoWatermarkedDerivative } from "../watermark";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_PORT = 8080;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function sendText(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(message) });
  res.end(message);
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;
    req.on("data", (chunk: Buffer) => {
      if (rejected) return;
      total += chunk.length;
      if (total > maxBytes) {
        rejected = true;
        req.removeAllListeners("data");
        req.resume();
        reject(new Error("PAYLOAD_TOO_LARGE"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

async function handleWatermarkRequest(req: IncomingMessage, res: ServerResponse, secret: string) {
  const providedSecret = req.headers["x-watermark-secret"];
  if (typeof providedSecret !== "string" || !constantTimeEqual(providedSecret, secret)) {
    sendText(res, 401, "Unauthorized");
    return;
  }

  let body: Buffer;
  try {
    body = await readBody(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof Error && err.message === "PAYLOAD_TOO_LARGE") {
      sendText(res, 413, "Payload too large");
    } else {
      sendText(res, 400, "Bad request");
    }
    return;
  }

  if (body.length === 0) {
    sendText(res, 422, "Empty image data");
    return;
  }

  try {
    const derivative = await createSakenoWatermarkedDerivative(body);
    res.writeHead(200, { "Content-Type": "image/webp", "Content-Length": derivative.length });
    res.end(derivative);
  } catch {
    sendText(res, 422, "Image could not be processed");
  }
}

export function startWatermarkServer(secret: string, port: number = DEFAULT_PORT): Server {
  if (!secret) throw new Error("WATERMARK_SERVICE_SECRET must be configured");

  const server = createServer((req, res) => {
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      if (!res.headersSent) sendText(res, 408, "Request timeout");
      req.destroy();
    });

    if (req.method === "GET" && req.url === "/") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "POST" && req.url === "/") {
      handleWatermarkRequest(req, res, secret).catch(() => {
        if (!res.headersSent) sendText(res, 500, "Internal server error");
      });
      return;
    }

    sendText(res, 404, "Not found");
  });

  server.listen(port);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.WATERMARK_SERVICE_SECRET;
  if (!secret) {
    console.error("WATERMARK_SERVICE_SECRET environment variable is required");
    process.exit(1);
  }
  const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;
  startWatermarkServer(secret, port);
  console.log(`Watermark service listening on port ${port}`);
}
