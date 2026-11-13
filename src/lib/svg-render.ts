/**
 * Turns an AI illustration (SVG code, already cleaned on the server) into a PNG file, in the browser only.
 * The SVG is drawn through an <img>, which never runs scripts, then onto a canvas with a white background.
 */
const SCALE = 2;

export async function svgToPng(svg: string, name = "ilustrasi.png"): Promise<File> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("The AI drawing could not be shown. Try again.");
    });
    const width = img.naturalWidth || 800;
    const height = img.naturalHeight || 600;
    const canvas = document.createElement("canvas");
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("The AI drawing could not be shown. Try again.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("The AI drawing could not be shown. Try again.");
    return new File([blob], name, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
