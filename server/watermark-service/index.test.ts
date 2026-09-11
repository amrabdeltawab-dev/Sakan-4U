import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { startWatermarkServer } from "./index";

const TEST_SECRET = "test-watermark-secret";
const PORT = 18099;
let server: Server;
let baseUrl: string;

beforeAll(() => {
  server = startWatermarkServer(TEST_SECRET, PORT);
  baseUrl = `http://127.0.0.1:${PORT}`;
});

afterAll(() => {
  server.close();
});

async function postImage(body: Buffer, secret?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/octet-stream" };
  if (secret !== undefined) headers["X-Watermark-Secret"] = secret;
  return fetch(baseUrl, { method: "POST", headers, body });
}

async function makeImage(width: number, height: number, format: "jpeg" | "png" | "webp"): Promise<Buffer> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 80, g: 120, b: 160 } } })[format]().toBuffer();
  return Buffer.from(buffer);
}

describe("watermark service health", () => {
  it("GET / returns 200 with status ok", async () => {
    const res = await fetch(baseUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const json = await res.json();
    expect(json).toEqual({ status: "ok" });
  });
});

describe("watermark service authentication", () => {
  it("POST without secret returns 401", async () => {
    const image = await makeImage(320, 240, "png");
    const res = await postImage(image);
    expect(res.status).toBe(401);
  });

  it("POST with wrong secret returns 401", async () => {
    const image = await makeImage(320, 240, "png");
    const res = await postImage(image, "wrong-secret");
    expect(res.status).toBe(401);
  });

  it("does not include the secret in error responses", async () => {
    const image = await makeImage(320, 240, "png");
    const res = await postImage(image, "wrong-secret");
    const text = await res.text();
    expect(text).not.toContain(TEST_SECRET);
    expect(text).not.toContain("secret");
  });
});

describe("watermark service image processing", () => {
  it("POST with correct secret and valid JPEG returns 200 image/webp", async () => {
    const image = await makeImage(640, 480, "jpeg");
    const res = await postImage(image, TEST_SECRET);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("POST with correct secret and valid PNG returns 200 image/webp", async () => {
    const image = await makeImage(400, 300, "png");
    const res = await postImage(image, TEST_SECRET);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("POST with correct secret and valid WebP returns 200 image/webp", async () => {
    const image = await makeImage(512, 384, "webp");
    const res = await postImage(image, TEST_SECRET);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("webp");
  });

  it("output differs from input (watermark was applied)", async () => {
    const image = await makeImage(480, 320, "png");
    const res = await postImage(image, TEST_SECRET);
    expect(res.status).toBe(200);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(image)).toBe(false);
  });

  it("POST with malformed/random bytes returns 422", async () => {
    const garbage = Buffer.from("not-an-image-just-random-text-data");
    const res = await postImage(garbage, TEST_SECRET);
    expect(res.status).toBe(422);
  });

  it("POST with empty body returns 422", async () => {
    const res = await postImage(Buffer.alloc(0), TEST_SECRET);
    expect(res.status).toBe(422);
  });
});

describe("watermark service size enforcement", () => {
  it("POST with payload larger than 5MB returns 413", async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0x41);
    const res = await postImage(oversized, TEST_SECRET);
    expect(res.status).toBe(413);
  });
});

describe("watermark service routing", () => {
  it("PUT / returns 404", async () => {
    const res = await fetch(baseUrl, { method: "PUT" });
    expect(res.status).toBe(404);
  });

  it("GET /unknown returns 404", async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });
});
