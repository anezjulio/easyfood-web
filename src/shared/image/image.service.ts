const API_BASE_URL = (import.meta.env.VITE_FAKE_API_URL || "").trim();
const IMAGE_BASE_URL = (import.meta.env.VITE_IMAGE_BASE_URL || "").trim() || `${API_BASE_URL}/images` || "/images";
const IMAGE_UPLOAD_URL =
  (import.meta.env.VITE_IMAGE_UPLOAD_URL || "").trim() || `${API_BASE_URL}/uploads/images` || "/uploads/images";

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function resolveImageUrl(value?: string): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (isAbsoluteUrl(raw) || raw.startsWith("data:")) return raw;

  const clean = normalizeSlashes(raw).replace(/^\/+/, "");
  if (clean.startsWith("images/")) {
    return `${IMAGE_BASE_URL}/${clean.slice("images/".length)}`;
  }
  return `${IMAGE_BASE_URL}/${clean}`;
}

function buildUploadName(file: File): string {
  const extFromName = (file.name.split(".").pop() || "").toLowerCase();
  const ext = extFromName ? `.${extFromName.replace(/[^a-z0-9]/g, "")}` : "";
  const base = file.name
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "img"}${ext}`;
}

export async function uploadImageFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Invalid file type");
  }

  const uploadName = buildUploadName(file);
  const response = await fetch(`${IMAGE_UPLOAD_URL}?name=${encodeURIComponent(uploadName)}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status}`);
  }

  const data = (await response.json()) as { path?: string; url?: string };
  if (data.path?.trim()) return data.path.trim();
  if (data.url?.trim()) return data.url.trim();
  throw new Error("Upload response missing image path");
}
