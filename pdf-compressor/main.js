// ===============================
// PDF圧縮ツール main.js（究極安定版）
// ===============================

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const { PDFDocument } = PDFLib;
let isCanceled = false;
let compressedFiles = [];
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

// 画質プリセット（文字ボケ対策にDPIを調整）
function getPresetSettings() {
  const preset = document.querySelector("input[name='qualityPreset']:checked").value;
  let setting = {};

  switch (preset) {
    case "mobile": setting = { dpi: 110, quality: 0.5 }; break; // 読みやすさ重視
    case "pc":     setting = { dpi: 150, quality: 0.6 }; break;
    case "pc-hi":  setting = { dpi: 300, quality: 0.8 }; break; // 文字が鮮明
    case "print":  setting = { dpi: 220, quality: 0.8 }; break;
    case "min":    setting = { dpi: 72,  quality: 0.3 }; break;
    default:       setting = { dpi: 150, quality: 0.6 };
  }

  // スマホでのメモリクラッシュ防止（上限を強制）
  if (isMobile && setting.dpi > 160) {
    setting.dpi = 160;
    setting.quality = 0.6;
  }
  return setting;
}

function updateProgress(percent) {
  const bar = document.getElementById("progressBar");
  if (bar) bar.style.width = percent + "%";
}

function resetUI() {
  updateProgress(0);
  document.getElementById("download").style.display = "none";
  document.getElementById("completeMsg").style.display = "none";
  document.getElementById("cancelMsg").style.display = "none";
  const list = document.getElementById("completeList");
  if (list) list.innerHTML = "";
  compressedFiles = [];
  document.getElementById("resetBtn").style.display = "none";
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("downloadNote").style.display = "none";
  isCanceled = false;
}

// ===============================
// PDF圧縮コア処理（メモリ最適化版）
// ===============================
async function compressPDF(file) {
  const preset = getPresetSettings();
  const scale = preset.dpi / 72;
  const quality = preset.quality;

  let pdf;
  let loadingTask;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    pdf = await loadingTask.promise;
  } catch (e) {
    alert("PDFの読み込みに失敗しました。ファイルが壊れているか、パスワードがかかっている可能性があります。");
    return null;
  }

  const newPdf = await PDFDocument.create();
  const totalPages = pdf.numPages;

  for (let i = 1; i <= totalPages; i++) {
    if (isCanceled) {
      loadingTask.destroy();
      return null;
    }

    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const renderViewport = page.getViewport({ scale });

      // Canvasの作成と描画
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = renderViewport.width;
      canvas.height = renderViewport.height;

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: renderViewport
      });

      await renderTask.promise;

      // 画像化
      const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
      const jpegBytes = dataURLToUint8Array(jpegDataUrl);
      const embeddedJpeg = await newPdf.embedJpg(jpegBytes);

      // 新しいPDFページに追加
      const newPage = newPdf.addPage([viewport.width, viewport.height]);
      newPage.drawImage(embeddedJpeg, {
        x: 0, y: 0,
        width: viewport.width,
        height: viewport.height
      });

      // --- メモリ解放処理 ---
      canvas.width = 0;
      canvas.height = 0;
      // --------------------

      updateProgress((i / totalPages) * 100);

      // ブラウザに休息を与える（固まり防止）
      // ページ数が多いほどこの待機が重要になる
      const waitTime = isMobile ? 400 : 100;
      await new Promise(r => setTimeout(r, waitTime));

    } catch (err) {
      console.error(`Page ${i} error:`, err);
      // 1ページ失敗しても続行を試みるか、エラーを出す
    }
  }

  loadingTask.destroy();
  const pdfBytes = await newPdf.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

// ===============================
// 単体PDFの処理（表示系を確実にする修正）
// ===============================
async function handleSingle(file) {
  resetUI();
  document.getElementById("cancelBtn").style.display = "inline-block";

  const result = await compressPDF(file);

  if (isCanceled || !result) return;

  const url = URL.createObjectURL(result);
  const downloadLink = document.getElementById("download");

  // ここで確実に表示させる
  downloadLink.href = url;
  downloadLink.download = file.name.replace(/\.pdf$/i, "_compressed.pdf");
  downloadLink.style.display = "inline-block"; // noneを解除
  downloadLink.style.visibility = "visible";   // visibility対策
  downloadLink.classList.add("show");

  const completeMsg = document.getElementById("completeMsg");
  completeMsg.textContent = "圧縮が完了しました！";
  completeMsg.style.display = "block";
  completeMsg.classList.add("show");

  document.getElementById("resetBtn").style.display = "inline-block";
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("downloadNote").style.display = "block";
}

// ===============================
// 複数PDFの処理（リスト表示を確実にする修正）
// ===============================
async function handleMultiple(files) {
  resetUI();
  document.getElementById("cancelBtn").style.display = "inline-block";

  const list = document.getElementById("completeList");
  list.style.display = "block"; // リスト自体を表示

  for (const file of files) {
    if (isCanceled) break;

    const result = await compressPDF(file);
    if (!result) continue;

    const url = URL.createObjectURL(result);

    const li = document.createElement("li");
    li.className = "compressed-item"; // CSSで制御しやすいようクラス付与
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.padding = "10px";
    li.style.borderBottom = "1px solid #eee";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = file.name;

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "保存";
    saveBtn.className = "save-btn"; // HTML側で定義したボタン風デザインを適用
    saveBtn.style.padding = "8px 16px";
    saveBtn.style.cursor = "pointer";

    saveBtn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "_compressed.pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    li.appendChild(nameSpan);
    li.appendChild(saveBtn);
    list.appendChild(li);

    await new Promise(r => setTimeout(r, 100));
  }

  document.getElementById("completeMsg").style.display = "block";
  document.getElementById("completeMsg").textContent = "すべての処理が完了しました";
  document.getElementById("resetBtn").style.display = "inline-block";
  document.getElementById("cancelBtn").style.display = "none";
  document.getElementById("downloadNote").style.display = "block";
}

// イベント設定
document.getElementById("fileButton").addEventListener("click", () => document.getElementById("fileInput").click());
document.getElementById("fileInput").addEventListener("change", (e) => {
  const files = [...e.target.files];
  if (files.length === 0) return;
  e.target.value = "";
  if (files.length === 1) handleSingle(files[0]);
  else handleMultiple(files);
});

// キャンセル処理
document.getElementById("cancelBtn").addEventListener("click", () => {
  isCanceled = true;
  document.getElementById("cancelMsg").style.display = "block";
  setTimeout(resetUI, 1000);
});

document.getElementById("resetBtn").addEventListener("click", resetUI);