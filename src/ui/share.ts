import { renderHeatmap } from "../export/render";
import { $ } from "../lib/dom";
import { S, firstName, signedIn } from "../state";
import { visibleEntries } from "../view";
import { closePops } from "./popover";

type Format = "png" | "pdf";
let format: Format = "png";
let numbers = true;
let current: { canvas: HTMLCanvasElement; width: number; height: number } | null = null;
let renderSeq = 0;

const nums = () => $<HTMLInputElement>("shNums");

/** "everyday-2026.png", or "everyday-hao_cui-2026.pdf" for a named person */
function filename(ext: Format) {
  const who = S.viewing ? S.profiles[S.viewing]?.handle : signedIn() ? S.profile?.handle : null;
  return `everyday-${who ? who + "-" : ""}${S.year}.${ext}`;
}

async function refresh() {
  const seq = ++renderSeq;
  $<HTMLButtonElement>("shDownload").disabled = true;
  const out = await renderHeatmap({ entries: visibleEntries(), year: S.year, layout: S.layout, numbers });
  if (seq !== renderSeq) return; // a newer toggle already started
  current = out;
  $<HTMLImageElement>("shPreview").src = out.canvas.toDataURL("image/png");
  $<HTMLButtonElement>("shDownload").disabled = false;
}

const pngBlob = (cv: HTMLCanvasElement) =>
  new Promise<Blob>((ok, fail) => cv.toBlob(b => (b ? ok(b) : fail(new Error("PNG encoding failed"))), "image/png"));

async function makeFile(): Promise<File> {
  if (!current) throw new Error("nothing rendered");
  if (format === "png") return new File([await pngBlob(current.canvas)], filename("png"), { type: "image/png" });
  // PDF: one page exactly the image's size, the image placed edge to edge
  const { jsPDF } = await import("jspdf"); // loaded only when someone actually asks for a PDF
  const { width, height } = current;
  const pdf = new jsPDF({ orientation: width >= height ? "landscape" : "portrait", unit: "pt", format: [width, height], compress: true });
  pdf.addImage(current.canvas.toDataURL("image/png"), "PNG", 0, 0, width, height);
  return new File([pdf.output("blob")], filename("pdf"), { type: "application/pdf" });
}

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function showError(msg: string) {
  $("shErr").textContent = msg;
  $("shErr").hidden = !msg;
}

function markFormat() {
  document.querySelectorAll<HTMLButtonElement>("[data-fmt]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.fmt === format)));
}

/** Share sheet with files (phones, Safari, Edge): only offered where the browser can really do it. */
function canShareFiles() {
  try {
    const probe = new File([""], "x.png", { type: "image/png" });
    return typeof navigator.share === "function" && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

export function openShare() {
  numbers = S.nums;
  nums().checked = numbers;
  showError("");
  $("shTitle").textContent = S.viewing ? `Share ${firstName(S.viewing)}’s ${S.year}` : `Share your ${S.year}`;
  $("shShare").hidden = !canShareFiles();
  markFormat();
  $("sharePop").hidden = false;
  $("scrim").hidden = false;
  void refresh();
}

export function bindShare() {
  $("shareBtn").addEventListener("click", openShare);
  $("shClose").addEventListener("click", closePops);
  nums().addEventListener("change", () => { numbers = nums().checked; void refresh(); });
  document.querySelectorAll<HTMLButtonElement>("[data-fmt]").forEach(b =>
    b.addEventListener("click", () => { format = b.dataset.fmt as Format; markFormat(); }));

  $("shDownload").addEventListener("click", async () => {
    showError("");
    try { saveFile(await makeFile()); }
    catch { showError("Couldn’t create the file. Try again, or switch to PNG."); }
  });

  $("shShare").addEventListener("click", async () => {
    showError("");
    try {
      const file = await makeFile();
      await navigator.share({ files: [file], title: `My ${S.year} on Everyday` });
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") showError("Sharing didn’t work here. Use Download instead.");
    }
  });
}
