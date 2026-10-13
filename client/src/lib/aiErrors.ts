import { ApiError } from "./queryClient";

// Turns an AI helper failure into toast copy. Limit and outage responses
// carry a friendly server message; anything else falls back to a generic
// "fill it in yourself" note so contributors are never stuck.
export function aiErrorToast(error: unknown, fallbackTitle: string): { title: string; description: string } {
  if (error instanceof ApiError) {
    const code = error.body?.code;
    const message = error.body?.message;
    if (code === "AI_RATE_LIMITED" || code === "AI_DAILY_LIMIT") {
      return { title: "AI helper is taking a break", description: message };
    }
    if (code === "AI_UNAVAILABLE") {
      return { title: "AI helper unavailable", description: message };
    }
    if (code === "AI_INPUT_INVALID" && message) {
      return { title: fallbackTitle, description: message };
    }
    if (error.status === 413) {
      return { title: fallbackTitle, description: "That image is too large. Please use a smaller screenshot or fill in the details yourself." };
    }
  }
  return { title: fallbackTitle, description: "Please fill in the details yourself." };
}
