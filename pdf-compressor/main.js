// ===============================
// PDF圧縮ツール main.js（スマホ複数PDF対応・個別DL方式 完全版）
// ===============================

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const { PDFDocument } = PDFLib;
let isCanceled = false;

// スマホ判定
const isMobile = window.innerWidth < 768;

// dataURL → Uint8Array
function dataURLToUint8Array(dataURL) {
  const base64 = dataURL.split(',')[1];
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ===============================
// 画質プリセット（PCのみ300dpi）
// ===============================
function getPresetSettings() {
  const preset = document.querySelector("input[name='qualityPreset']:checked").value;

  let setting = {};

  switch (preset) {
    case "mobile":
      setting = { dpi: 96, quality: 0.5 };
      break;

    case "pc":
      setting = { dpi: 144, quality: 0.6 };
      break;

    case "pc-hi":
      setting = { dpi: 300, quality: 0.8 };
      break;

    case "print":
      setting = { dpi: 200, quality: 0.8 };
      break;

    case "min":
      setting = { dpi: 72, quality: 0.4 };
      break;

    default:
      setting = { dpi: 144, quality: 0.6 };
  }

  // ★ スマホでは高DPIを強制的に144dpiに変更（安定化）
  if (isMobile && setting.dpi > 144) {
    setting = { dpi: 144, quality: 0.6 };
  }

  return setting;
}

// プログレスバー更新
function updateProgress(percent) {
  document.getElementById("progressBar").style.width = percent + "%";
}

// UIリセット
function resetUI() {
  isCanceled = false;
  updateProgress(0);

  const download = document.getElementById("download");
  download.style.display = "none";
  download.classList.remove("show");

  const completeMsg = document.getElementById("completeMsg");
  completeMsg.style.display = "none";
  completeMsg.classList.remove("show");

  // ★ 完了リストをクリア
  const list = document.getElementById("completeList");
  if (list) list.innerHTML = "";

  document.getElementById("resetBtn").style.display = "none";
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("downloadNote").style.display = "none";
}

// ===============================
// PDF圧縮処理（ページサイズ維持）
// ===============================
async function compressPDF(file) {
  const preset = getPresetSettings();
  const scale = preset.dpi / 72;
  const quality = preset.quality;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const newPdf = await PDFDocument.create();
  const totalPages = pdf.numPages;

  for (let i = 1; i <= totalPages; i++) {
    if (isCanceled) return null;

    const page = await pdf.getPage(i);

    const originalViewport = page.getViewport({ scale: 1 });
    const pageWidth = originalViewport.width;
    const pageHeight = originalViewport.height;

    const renderViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;

    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
    const jpegBytes = dataURLToUint8Array(jpegDataUrl);

    const newPage = newPdf.addPage([pageWidth, pageHeight]);
    const embeddedJpeg = await newPdf.embedJpg(jpegBytes);

    newPage.drawImage(embeddedJpeg, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight
    });

    canvas.width = 1;
    canvas.height = 1;

    updateProgress((i / totalPages) * 100);
  }

  const compressedPdfBytes = await newPdf.save();
  return new Blob([compressedPdfBytes], { type: "application/pdf" });
}

// ===============================
// 単体PDFの処理
// ===============================
async function handleSingle(file) {
  resetUI();
  document.getElementById("cancelBtn").style.display = "inline-block";

  const result = await compressPDF(file);

  if (isCanceled || !result) {
    alert("キャンセルされました");
    resetUI();
    return;
  }

  const url = URL.createObjectURL(result);
  const downloadLink = document.getElementById("download");

  downloadLink.href = url;
  downloadLink.download = file.name.replace(/\.pdf$/i, "_compressed.pdf");

  downloadLink.style.display = "inline-block";
  downloadLink.classList.add("show");

  const completeMsg = document.getElementById("completeMsg");
  completeMsg.textContent = "圧縮が完了しました！";
  completeMsg.style.display = "block";
  completeMsg.classList.add("show");

  document.getElementById("resetBtn").style.display = "inline-block";
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("downloadNote").style.display = "block";

  isCanceled = false;
}

// ===============================
// 複数PDF → 個別ダウンロード方式（スマホ対応）
// ===============================
async function handleMultiple(files) {
  resetUI();
  document.getElementById("cancelBtn").style.display = "inline-block";

  const list = document.getElementById("completeList");

  for (const file of files) {
    if (isCanceled) break;

    const result = await compressPDF(file);
    if (!result) break;

    const url = URL.createObjectURL(result);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.replace(/\.pdf$/i, "_compressed.pdf");
    document.body.appendChild(a);
    a.click();
    a.remove();

    // ★ 完了リストに追加
    const li = document.createElement("li");
    li.textContent = `ダウンロード完了：${file.name}`;
    list.appendChild(li);

    await new Promise(r => setTimeout(r, isMobile ? 300 : 100));
  }

  document.getElementById("resetBtn").style.display = "inline-block";
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("downloadNote").style.display = "block";

  isCanceled = false;
}

// ===============================
// イベント設定
// ===============================

document.getElementById("fileButton").addEventListener("click", () => {
  document.getElementById("fileInput").click();
});

document.getElementById("fileInput").addEventListener("change", (e) => {
  const files = [...e.target.files];
  e.target.value = "";

  if (files.length === 1) handleSingle(files[0]);
  else handleMultiple(files);
});

// ドラッグ＆ドロップ
const dropArea = document.getElementById("dropArea");

dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("dragover");
  document.body.classList.add("dragover");
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("dragover");
  document.body.classList.remove("dragover");
});

dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("dragover");
  document.body.classList.remove("dragover");

  const files = [...e.dataTransfer.files].filter(f => f.type === "application/pdf");

  if (files.length === 1) handleSingle(files[0]);
  else handleMultiple(files);
});

// キャンセル
document.getElementById("cancelBtn").addEventListener("click", () => {
  isCanceled = true;
});

// リセット
document.getElementById("resetBtn").addEventListener("click", () => {
  resetUI();
  isCanceled = false;
});
