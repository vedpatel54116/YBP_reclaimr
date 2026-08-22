import {
  API_ROUTES,
  type CreateSubscriptionInput,
  type Paginated,
  type Subscription,
  type SubscriptionSuggestionsResponse,
  type UpdateSubscriptionInput,
} from "@reclaimr/shared";

function getApiBaseUrl(): string | null {
  // Server-side rendering must not use the public hostname. It resolves to the
  // box's own Elastic IP, and an EC2 instance cannot reach its own EIP — there
  // is no hairpin NAT path through the internet gateway — so every SSR fetch
  // would fail. apiFetch swallows failures and returns null, so the dashboard
  // would render empty with nothing logged. Reach the API over the Docker
  // network instead.
  //
  // Deliberately not NEXT_PUBLIC_*, so Next.js never inlines it into the client
  // bundle; in the browser this is undefined and the public URL below is used.
  const internalUrl = process.env.API_INTERNAL_URL?.trim();
  if (internalUrl) return internalUrl.replace(/\/+$/, "");

  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // In production deployments (e.g. Vercel) without a live backend configured,
  // do not try to reach localhost:3001 during server-side rendering.
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return "http://localhost:3001";
}

/**
 * Thin fetch wrapper for the JSON API. Returns null on any network or HTTP
 * failure — callers decide whether that is an error state or a fallback to
 * demo data.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<unknown | null> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${baseUrl}${path}`, {
      cache: "no-store",
      signal: controller.signal,
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

    clearTimeout(timer);

    if (!response.ok) return null;
    if (response.status === 204) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** Fetches a page of subscriptions; null when the API is unreachable. */
export async function fetchSubscriptions(pageSize = 100): Promise<Paginated<Subscription> | null> {
  const json = await apiFetch(`${API_ROUTES.subscriptions.list}?pageSize=${pageSize}`);
  if (!json || typeof json !== "object" || !("data" in json)) return null;
  return json as Paginated<Subscription>;
}

/** Fetches one subscription; null when unreachable or not found. */
export async function fetchSubscription(id: string): Promise<Subscription | null> {
  const json = await apiFetch(API_ROUTES.subscriptions.detail(id));
  if (!json || typeof json !== "object" || !("id" in json)) return null;
  return json as Subscription;
}

/** Partially updates a subscription (status, amount, cadence, ...). */
export async function updateSubscription(
  id: string,
  patch: UpdateSubscriptionInput,
): Promise<Subscription | null> {
  const json = await apiFetch(API_ROUTES.subscriptions.detail(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!json || typeof json !== "object" || !("id" in json)) return null;
  return json as Subscription;
}

/** Creates a manually-tracked subscription. */
export async function createSubscription(
  input: CreateSubscriptionInput,
): Promise<Subscription | null> {
  const json = await apiFetch(API_ROUTES.subscriptions.create, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!json || typeof json !== "object" || !("id" in json)) return null;
  return json as Subscription;
}

/**
 * Fetches cached alternative advice for one subscription.
 *
 * Returns `undefined` when the API could not be reached (caller may fall back
 * to fixtures) and `null` when the API answered but has nothing generated yet —
 * a real empty state that must not be replaced with demo content.
 */
export async function fetchSubscriptionSuggestions(
  id: string,
): Promise<SubscriptionSuggestionsResponse["data"] | undefined> {
  const json = await apiFetch(API_ROUTES.ai.suggestionsForSubscription(id));
  if (!json || typeof json !== "object" || !("data" in json)) return undefined;
  return (json as SubscriptionSuggestionsResponse).data;
}
