import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWatermarkDerivativeViaService,
  setWatermarkServiceConfig,
  WatermarkServiceError,
} from "./client";

const TEST_URL = "http://127.0.0.1:18098";
const TEST_SECRET = "test-watermark-secret";
const FAKE_WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

function mockResponse(status: number, contentType: string, body: Uint8Array | null): Response {
  const headers = new Headers({ "Content-Type": contentType });
  return new Response(body ?? new Uint8Array(0), { status, headers });
}

function makeOkResponse(body: Uint8Array = FAKE_WEBP): Response {
  return mockResponse(200, "image/webp", body);
}

beforeEach(() => {
  setWatermarkServiceConfig({ url: TEST_URL, secret: TEST_SECRET });
});

afterEach(() => {
  setWatermarkServiceConfig(undefined);
  vi.restoreAllMocks();
});

describe("watermark client — successful request", () => {
  it("sends POST with correct method, Content-Type, and secret header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(makeOkResponse());
    await createWatermarkDerivativeViaService(FAKE_WEBP);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${TEST_URL}/`);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "Content-Type": "application/octet-stream",
      "X-Watermark-Secret": TEST_SECRET,
    });
  });

  it("returns the WebP bytes from a 200 image/webp response", async () => {
    const result = new Uint8Array([1, 2, 3, 4, 5]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(200, "image/webp", result));
    const output = await createWatermarkDerivativeViaService(FAKE_WEBP);
    expect(output).toEqual(result);
  });
});

describe("watermark client — error handling", () => {
  it("throws WatermarkServiceError on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(401, "text/plain", null));
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toMatchObject({
      statusCode: 401,
      name: "WatermarkServiceError",
    });
  });

  it("throws WatermarkServiceError on 413", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(413, "text/plain", null));
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toMatchObject({ statusCode: 413 });
  });

  it("throws WatermarkServiceError on 422", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(422, "text/plain", null));
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws WatermarkServiceError on 500", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(500, "text/plain", null));
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toMatchObject({ statusCode: 500 });
  });

  it("throws WatermarkServiceError on unexpected Content-Type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(200, "text/html", new Uint8Array([1, 2])));
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toMatchObject({ statusCode: 502 });
  });

  it("throws WatermarkServiceError on empty response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(200, "image/webp", null));
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("watermark client — network and timeout errors", () => {
  it("throws 503 on network/fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("connect ECONNREFUSED"));
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toMatchObject({ statusCode: 503 });
  });

  it("throws 408 on timeout (AbortError)", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toMatchObject({ statusCode: 408 });
  });
});

describe("watermark client — missing configuration", () => {
  it("throws when WATERMARK_SERVICE_URL is not configured", async () => {
    setWatermarkServiceConfig(undefined);
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toThrow(
      "WATERMARK_SERVICE_URL and WATERMARK_SERVICE_SECRET must be configured",
    );
  });

  it("throws when secret is missing but url is set", async () => {
    setWatermarkServiceConfig({ url: TEST_URL, secret: "" });
    await expect(createWatermarkDerivativeViaService(FAKE_WEBP)).rejects.toThrow(
      "WATERMARK_SERVICE_URL and WATERMARK_SERVICE_SECRET must be configured",
    );
  });
});

describe("watermark client — secret safety", () => {
  it("does not include the secret in error messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(401, "text/plain", null));
    try {
      await createWatermarkDerivativeViaService(FAKE_WEBP);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(TEST_SECRET);
    }
  });

  it("does not include the secret in thrown WatermarkServiceError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(500, "text/plain", null));
    try {
      await createWatermarkDerivativeViaService(FAKE_WEBP);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(TEST_SECRET);
    }
  });
});
