export class ApiError extends Error {
  readonly status: number;
  readonly errors: string[];

  constructor(status: number, message: string, errors: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

interface ErrorPayload {
  error?: unknown;
  errors?: unknown;
}

function errorMessage(payload: ErrorPayload | undefined, status: number) {
  const errors = Array.isArray(payload?.errors)
    ? payload.errors.filter((item): item is string => typeof item === "string")
    : [];
  const message =
    typeof payload?.error === "string"
      ? payload.error
      : errors.length > 0
        ? errors.join(" ")
        : `Request failed with ${status}`;

  return { message, errors };
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as ErrorPayload | undefined;
    const { message, errors } = errorMessage(payload, response.status);

    if (response.status === 401 && typeof window !== "undefined") {
      const callbackUrl = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }

    throw new ApiError(response.status, message, errors);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
