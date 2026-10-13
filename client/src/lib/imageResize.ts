// Claude downsizes images to ~1568px on the long edge anyway, so shrinking
// screenshots before upload costs no extraction quality. It also keeps phone
// screenshots under the server's upload cap and Vercel's 4.5 MB body limit.
const MAX_EDGE = 1568;
const SKIP_BELOW_BYTES = 600_000;

export interface PreparedImage {
  dataUrl: string;
  base64: string;
  mediaType: string;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toPrepared(dataUrl: string, mediaType: string): PreparedImage {
  return { dataUrl, base64: dataUrl.split(",")[1], mediaType };
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const original = await readAsDataUrl(file);
  // GIFs may be animated; small images are already fine.
  if (file.type === "image/gif" || file.size < SKIP_BELOW_BYTES) return toPrepared(original, file.type);

  try {
    const img = new Image();
    img.src = original;
    await img.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return toPrepared(original, file.type);
    ctx.fillStyle = "#fff"; // JPEG has no alpha
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return toPrepared(canvas.toDataURL("image/jpeg", 0.85), "image/jpeg");
  } catch {
    return toPrepared(original, file.type);
  }
}
