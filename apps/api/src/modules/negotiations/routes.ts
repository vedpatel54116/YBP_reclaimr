import multipart from "@fastify/multipart";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createNegotiationSchema,
  idParamSchema,
  listNegotiationsQuerySchema,
  respondToOfferSchema,
  STATEMENT_MAX_BYTES,
} from "@reclaimr/shared";
import { badRequest, notFound } from "../../lib/errors";
import type { NegotiationDocumentService } from "./document.service";
import type { NegotiationService } from "./service";

function requestContext(request: FastifyRequest) {
  return { ip: request.ip, userAgent: request.headers["user-agent"] ?? null };
}

/** The shared id param schema covers `:id` only; downloads also carry a doc id. */
const documentParamsSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
});

export interface NegotiationRoutesOptions {
  negotiations: NegotiationService;
  documents: NegotiationDocumentService;
}

/** @fastify/multipart signals an over-limit part with this code. */
function isFileTooLarge(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "FST_REQ_FILE_TOO_LARGE";
}

/**
 * Bill negotiation requests, statements, and the member's offer decision.
 *
 * Writes require premium; reads do not, so a member whose card lapsed can still
 * retrieve their own case history and the statements they uploaded.
 */
export const negotiationRoutes: FastifyPluginAsync<NegotiationRoutesOptions> = async (
  app,
  options,
) => {
  const { negotiations, documents } = options;

  // Registered inside this plugin so multipart parsing is scoped here. The JSON
  // API and, critically, the Stripe webhook's raw-body parser are unaffected.
  await app.register(multipart, {
    limits: { fileSize: STATEMENT_MAX_BYTES, files: 1, fields: 4 },
  });

  app.get("/negotiations", { preHandler: app.requireAuth }, async (request) => {
    const query = listNegotiationsQuerySchema.parse(request.query);
    return negotiations.list(request.user!.sub, query);
  });

  app.post(
    "/negotiations",
    { preHandler: [app.requireAuth, app.requirePremium] },
    async (request, reply) => {
      const input = createNegotiationSchema.parse(request.body);
      const created = await negotiations.create(request.user!.sub, input, requestContext(request));
      return reply.code(201).send(created);
    },
  );

  app.get("/negotiations/:id", { preHandler: app.requireAuth }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const found = await negotiations.findOwned(request.user!.sub, id);
    if (!found) throw notFound("Negotiation case not found");
    return found;
  });

  app.post(
    "/negotiations/:id/withdraw",
    { preHandler: [app.requireAuth, app.requirePremium] },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const updated = await negotiations.withdraw(request.user!.sub, id, requestContext(request));
      if (!updated) throw notFound("Negotiation case not found");
      return updated;
    },
  );

  app.post(
    "/negotiations/:id/offer/approve",
    { preHandler: [app.requireAuth, app.requirePremium] },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const input = respondToOfferSchema.parse(request.body ?? {});
      const updated = await negotiations.approveOffer(
        request.user!.sub,
        id,
        input,
        requestContext(request),
      );
      if (!updated) throw notFound("Negotiation case not found");
      return updated;
    },
  );

  app.post(
    "/negotiations/:id/offer/reject",
    { preHandler: [app.requireAuth, app.requirePremium] },
    async (request) => {
      const { id } = idParamSchema.parse(request.params);
      const input = respondToOfferSchema.parse(request.body ?? {});
      const updated = await negotiations.rejectOffer(
        request.user!.sub,
        id,
        input,
        requestContext(request),
      );
      if (!updated) throw notFound("Negotiation case not found");
      return updated;
    },
  );

  app.post(
    "/negotiations/:id/documents",
    { preHandler: [app.requireAuth, app.requirePremium] },
    async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);

      const part = await request.file();
      if (!part) throw badRequest("A statement file is required", "FILE_REQUIRED");

      let bytes: Buffer;
      try {
        bytes = await part.toBuffer();
      } catch (error) {
        // Surface the size cap in our own error shape rather than letting the
        // parser's raw 413 escape unshaped.
        if (isFileTooLarge(error)) {
          throw badRequest("Statements must be 10MB or smaller", "FILE_TOO_LARGE");
        }
        throw error;
      }

      const document = await documents.upload(
        request.user!.sub,
        id,
        { filename: part.filename, contentType: part.mimetype, bytes },
        requestContext(request),
      );
      return reply.code(201).send(document);
    },
  );

  app.get("/negotiations/:id/documents", { preHandler: app.requireAuth }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return documents.list(request.user!.sub, id);
  });

  app.get(
    "/negotiations/:id/documents/:documentId",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { id, documentId } = documentParamsSchema.parse(request.params);
      const file = await documents.download(request.user!.sub, id, documentId);

      return (
        reply
          .header("content-type", file.contentType)
          // `attachment` prevents a PDF or image from rendering inline in the
          // API's origin, which would make stored content a scripting surface.
          .header(
            "content-disposition",
            `attachment; filename="${encodeURIComponent(file.filename)}"`,
          )
          .header("content-length", String(file.bytes.byteLength))
          .send(file.bytes)
      );
    },
  );
};
