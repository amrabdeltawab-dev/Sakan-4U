import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { getRuntimeEnvValue } from "../runtimeEnv";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { getPublicProperty } from "../db";

const defaultTitle = "Sakan 4U | Sakan 4U - سكن طلابي";
const defaultDescription = "منصة حجز سكن الطلاب ومطابقة الطلبات المعتمدة في بني سويف.";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function injectPropertyMetadata(template: string, requestPath: string, requestOrigin = "") {
  const match = requestPath.match(/^\/property\/([^/?#]+)$/);
  if (!match) return template;
  try {
    const property = await getPublicProperty(decodeURIComponent(match[1]));
    if (!property) return template;
    const title = `${property.title} | Sakan 4U`;
    const rentLabel = property.rentType === "bed" ? "جنيه للسرير شهرياً" : "جنيه شهرياً";
    const description = `${new Intl.NumberFormat("ar-EG").format(Number(property.monthlyPrice))} ${rentLabel} · ${property.approximateLocation}`;
    const image = property.media?.find((media: any) => media.isPrimary)?.url ?? property.media?.[0]?.url ?? "";
    const pageUrl = requestOrigin ? `${requestOrigin}${requestPath}` : requestPath;
    const imageTags = image ? `<meta property="og:image" content="${escapeHtml(image)}" />\n    <meta name="twitter:image" content="${escapeHtml(image)}" />` : "";
    return template
      .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`)
      .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/i, `<meta name="description" content="${escapeHtml(description)}" />`)
      .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/i, `<meta property="og:title" content="${escapeHtml(title)}" />`)
      .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/i, `<meta property="og:description" content="${escapeHtml(description)}" />`)
      .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/i, `<meta name="twitter:title" content="${escapeHtml(title)}" />`)
      .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/i, `<meta name="twitter:description" content="${escapeHtml(description)}" />`)
      .replace("</head>", `${imageTags}\n    <meta property="og:url" content="${escapeHtml(pageUrl)}" />\n    </head>`);
  } catch {
    return template;
  }
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  const serveHtml = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const requestOrigin = `${req.protocol}://${req.get("host") ?? ""}`;
      template = await injectPropertyMetadata(template, req.path, requestOrigin);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  };

  // Vite's SPA fallback can answer property paths itself, so this route must run first.
  app.get("/property/:id", serveHtml);
  app.use(vite.middlewares);
  app.use("*", serveHtml);
}

export function serveStatic(app: Express) {
  const distPath =
    getRuntimeEnvValue("NODE_ENV") === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const requestOrigin = `${req.protocol}://${req.get("host") ?? ""}`;
      res.status(200).set({ "Content-Type": "text/html" }).end(await injectPropertyMetadata(template, req.path, requestOrigin));
    } catch (error) {
      next(error);
    }
  });
}
