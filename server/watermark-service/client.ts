const TIMEOUT_MS = 30_000;

export type WatermarkServiceConfig = {
  url: string;
  secret: string;
};

let activeConfig: WatermarkServiceConfig | undefined;

export function setWatermarkServiceConfig(config: WatermarkServiceConfig | undefined) {
  activeConfig = config;
}

function requireConfig(): WatermarkServiceConfig {
  if (!activeConfig || !activeConfig.url || !activeConfig.secret) {
    throw new Error("WATERMARK_SERVICE_URL and WATERMARK_SERVICE_SECRET must be configured");
  }
  return activeConfig;
}

export class WatermarkServiceError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "WatermarkServiceError";
  }
}

export async function createWatermarkDerivativeViaService(imageBytes: Uint8Array): Promise<Uint8Array> {
  const config = requireConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.url}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Watermark-Secret": config.secret,
      },
      body: imageBytes as BodyInit,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new WatermarkServiceError(408, "Watermark service request timed out");
    }
    throw new WatermarkServiceError(503, "Watermark service is unavailable");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new WatermarkServiceError(
      response.status,
      response.status === 401
        ? "Watermark service authentication failed"
        : response.status === 413
          ? "Image exceeds maximum allowed size"
          : response.status === 422
            ? "Image could not be processed"
            : `Watermark service returned ${response.status}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("image/webp")) {
    throw new WatermarkServiceError(502, "Watermark service returned unexpected content type");
  }

  const body = await response.arrayBuffer();
  if (!body.byteLength) {
    throw new WatermarkServiceError(502, "Watermark service returned empty response");
  }

  return new Uint8Array(body);
}
