import { readJsonOrThrow } from "../../../shared/http/http";
import type { FeedbackDraft, FeedbackEntry } from "../model/feedback.types";

export async function fetchFeedbackApi(): Promise<FeedbackEntry[]> {
  const response = await fetch("/feedback");
  return await readJsonOrThrow<FeedbackEntry[]>(response);
}

export async function createFeedbackApi(draft: FeedbackDraft): Promise<FeedbackEntry> {
  const response = await fetch("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<FeedbackEntry>(response);
}
