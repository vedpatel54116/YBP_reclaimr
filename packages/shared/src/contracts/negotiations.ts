import { API_ROUTES } from "../constants";
import { idParamSchema } from "../schemas/common";
import {
  createNegotiationSchema,
  listNegotiationsQuerySchema,
  negotiationCaseSchema,
  negotiationDocumentSchema,
  respondToOfferSchema,
} from "../schemas/negotiation";
import { paginatedSchema } from "../schemas/pagination";

/**
 * Bill negotiation requests. The success fee (35–60% of confirmed first-year
 * savings) is charged only after the member approves the rate the concierge
 * secured — never on the projection shown at submit time.
 */
export const negotiationsContract = {
  list: {
    method: "GET",
    path: API_ROUTES.negotiations.list,
    query: listNegotiationsQuerySchema,
    response: paginatedSchema(negotiationCaseSchema),
  },
  create: {
    method: "POST",
    path: API_ROUTES.negotiations.create,
    body: createNegotiationSchema,
    response: negotiationCaseSchema,
  },
  get: {
    method: "GET",
    path: `${API_ROUTES.negotiations.detail("{id}")}`,
    params: idParamSchema,
    response: negotiationCaseSchema,
  },
  /** Member withdraws the request before resolution. */
  withdraw: {
    method: "POST",
    path: `${API_ROUTES.negotiations.withdraw("{id}")}`,
    params: idParamSchema,
    response: negotiationCaseSchema,
  },

  /**
   * Member approves the secured rate. This is the only path to `succeeded`,
   * and the only thing that books a success fee.
   */
  approveOffer: {
    method: "POST",
    path: `${API_ROUTES.negotiations.approveOffer("{id}")}`,
    params: idParamSchema,
    body: respondToOfferSchema,
    response: negotiationCaseSchema,
  },
  /** Member declines the secured rate; the case fails and no fee is charged. */
  rejectOffer: {
    method: "POST",
    path: `${API_ROUTES.negotiations.rejectOffer("{id}")}`,
    params: idParamSchema,
    body: respondToOfferSchema,
    response: negotiationCaseSchema,
  },

  /**
   * Statement upload. `multipart/form-data` with a single `file` part — the
   * only non-JSON request body in the API, so it is described by content type
   * rather than a body schema.
   */
  uploadDocument: {
    method: "POST",
    path: `${API_ROUTES.negotiations.documents("{id}")}`,
    params: idParamSchema,
    contentType: "multipart/form-data",
    response: negotiationDocumentSchema,
  },
  listDocuments: {
    method: "GET",
    path: `${API_ROUTES.negotiations.documents("{id}")}`,
    params: idParamSchema,
    response: negotiationDocumentSchema.array(),
  },
  /** Streams the stored statement back to its owner. */
  downloadDocument: {
    method: "GET",
    path: `${API_ROUTES.negotiations.document("{id}", "{documentId}")}`,
    contentType: "application/octet-stream",
  },
} as const;
