const fileInput   = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");
const progressBar = document.getElementById("progressBar");
const download    = document.getElementById("download");
const thumbs      = document.getElementById("thumbs");
const cancelBtn   = document.getElementById("cancelBtn");
const resetBtn    = document.getElementById("resetBtn");

let cancelRequested = false;

function resetScreen() {
  cancelRequested = false;

  cancelBtn.style.display = "none";
  resetBtn.style.display  = "none";

  const msg = document.getElementById("completeMsg");
  msg.style.display = "none";
  msg.classList.remove("show");

  download.style.display = "none";
  download.classList.remove("show");

  document.getElementById("downloadNote").style.display = "none";

  thumbs.innerHTML = "";
  progressBar.style.width = "0%";
}

/* ▼ ドラッグ＆ドロップ対応 */

// デフォルト動作を無効化
document.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.addEventListener("dragenter", () => {
  document.body.classList.add("dragover");
});

document.addEventListener("dragleave", () => {
  document.body.classList.remove("dragover");
});

// ▼ ここ重要：document の drop は削除し、dropArea のみ使用
const dropArea = document.getElementById("dropArea");

dropArea.addEventListener("click", () => {
  fileInput.click();
});

dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("dragover");
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("dragover");
});

dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("dragover");

  const droppedFiles = Array.from(e.dataTransfer.files);
  const pdfFiles = droppedFiles.filter(f =>
    f.name.toLowerCase().endsWith(".pdf")
  );

  if (pdfFiles.length === 0) {
    alert("PDFファイルをドロップしてください。");
    return;
  }

  resetScreen();
  processFiles(pdfFiles);
});

fileInput.addEventListener("change", () => {
  resetScreen();
  const files = Array.from(fileInput.files);
  processFiles(files);
});

folderInput.addEventListener("change", () => {
  resetScreen();
  const allFiles = Array.from(folderInput.files);
  const pdfFiles = allFiles.filter(f => f.name.toLowerCase().endsWith(".pdf"));

  if (pdfFiles.length !== allFiles.length) {
    alert("PDF以外のデータは無視して変換を開始します。");
  }

  processFiles(pdfFiles);
});

/* ▼ onclick → addEventListener（CSP対応） */

cancelBtn.addEventListener("click", () => {
  cancelRequested = true;

  cancelBtn.style.display = "none";
  resetBtn.style.display  = "inline-block";

  fileInput.disabled   = false;
  folderInput.disabled = false;

  alert("変換をキャンセルしました");
});

resetBtn.addEventListener("click", () => {
  location.reload();
});

async function processFiles(files) {

  fileInput.disabled   = true;
  folderInput.disabled = true;
  cancelBtn.style.display = "inline-block";

  if (files.length === 0) {
    alert("PDF が見つかりません");
    return;
  }

  thumbs.innerHTML = "";
  progressBar.style.width = "0%";

  const zip = new JSZip();
  let processedPages = 0;
  let totalPages     = 0;

  // ▼ 全ページ数を先にカウント
  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    totalPages += pdf.numPages;
  }

  const singlePDF = (files.length === 1 && totalPages === 1);

  let jpegFiles = [];

  for (const file of files) {

    if (cancelRequested) return;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const baseName = file.name.replace(/\.pdf$/i, "");

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

      if (cancelRequested) return;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width  = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegData = canvas.toDataURL("image/jpeg");

      // ▼ ダウンロード用データ
      if (singlePDF) {
        jpegFiles.push({
          name: `${baseName}_${String(pageNum).padStart(3, "0")}.jpg`,
          data: jpegData
        });
      } else {
        const base64  = jpegData.split(",")[1];
        const pageStr = String(pageNum).padStart(3, "0");
        zip.file(`${baseName}_${pageStr}.jpg`, base64, { base64: true });
      }

      // ▼ サムネイル用 Blob URL（Chrome の about:blank#blocked 回避）
      const byteString = atob(jpegData.split(",")[1]);
      const array = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        array[i] = byteString.charCodeAt(i);
      }
      const blob    = new Blob([array], { type: "image/jpeg" });
      const blobUrl = URL.createObjectURL(blob);

      // ▼ サムネイル生成
      const thumbDiv = document.createElement("div");
      thumbDiv.className = "thumb";

      const link = document.createElement("a");
      link.href   = blobUrl;
      link.target = "_blank";
      link.rel    = "noopener noreferrer";

      const img = document.createElement("img");
      img.src = jpegData;

      const caption = document.createElement("div");
      caption.textContent = `${file.name} - p.${pageNum}`;

      link.appendChild(img);
      thumbDiv.appendChild(link);
      thumbDiv.appendChild(caption);
      thumbs.appendChild(thumbDiv);

      processedPages++;
      const percent = Math.floor((processedPages / totalPages) * 100);
      progressBar.style.width = percent + "%";
    }
  }

  fileInput.disabled   = false;
  folderInput.disabled = false;
  cancelBtn.style.display = "none";

  if (singlePDF) {
    const first = jpegFiles[0];
    download.href     = first.data;
    download.download = first.name;
  } else {
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    download.href     = url;
    download.download = "converted.zip";
  }

  download.style.display = "block";
  setTimeout(() => download.classList.add("show"), 10);

  document.getElementById("downloadNote").style.display = "block";
  resetBtn.style.display = "inline-block";

  const msg = document.getElementById("completeMsg");
  msg.style.display = "block";
  setTimeout(() => msg.classList.add("show"), 10);
}

/* ▼ ボタンイベント（CSP対応済み） */

document.getElementById("fileButton").addEventListener("click", () => {
  fileInput.click();
});

document.getElementById("folderButton").addEventListener("click", () => {
  folderInput.click();
});