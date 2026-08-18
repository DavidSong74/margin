import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { supabase } from "@/lib/supabase";

export interface ExportProgressCallback {
  (message: string): void;
}

export async function exportJournalToPdf(
  journalId: string,
  journalTitle: string,
  onProgress?: ExportProgressCallback,
): Promise<string> {
  onProgress?.("Fetching journal pages…");

  // 1. Fetch pages from Supabase
  const { data: pages, error } = await supabase
    .from("pages")
    .select("id, page_number, image_path, transcription_text, created_at")
    .eq("journal_id", journalId)
    .is("deleted_at", null)
    .order("page_number", { ascending: true });

  if (error) throw new Error(`Failed to load pages: ${error.message}`);
  if (!pages || pages.length === 0) {
    throw new Error("This journal does not contain any pages to export.");
  }

  onProgress?.("Preparing images & transcriptions…");

  // 2. Obtain signed URLs for page images
  const imagePaths = pages.map((p) => p.image_path).filter(Boolean);
  let signedMap: Record<string, string> = {};

  if (imagePaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("journal_pages")
      .createSignedUrls(imagePaths, 3600);

    signedMap = Object.fromEntries(
      (signed ?? []).map((s) => [s.path, s.signedUrl])
    );
  }

  onProgress?.("Generating printable PDF layout…");

  // 3. Construct elegant book-style HTML
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const formattedDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const pagesHtml = pages
    .map((p) => {
      const imgUrl = p.image_path ? signedMap[p.image_path] : null;
      const transcription = p.transcription_text
        ? escapeHtml(p.transcription_text).replace(/\n/g, "<br/>")
        : "<em style='color: #8c827a;'>No transcription recorded.</em>";

      return `
      <div class="page-container">
        <div class="page-header">
          <span class="journal-tag">${escapeHtml(journalTitle)}</span>
          <span class="page-num">Page ${p.page_number}</span>
        </div>
        
        <div class="page-content">
          ${
            imgUrl
              ? `<div class="image-wrapper">
                   <img src="${imgUrl}" alt="Page ${p.page_number}" class="page-image" />
                 </div>`
              : ""
          }
          
          <div class="transcription-wrapper">
            <h4 class="transcription-heading">TRANSCRIPTION</h4>
            <div class="transcription-body">
              ${transcription}
            </div>
          </div>
        </div>
        
        <div class="page-footer">
          <span>Margin Archive</span>
          <span>${formattedDate}</span>
        </div>
      </div>
    `;
    })
    .join("");

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(journalTitle)} - Margin Export</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm 20mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif;
            color: #1a1614;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
          }
          
          .cover-page {
            page-break-after: always;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 40px;
          }
          .cover-title {
            font-family: Georgia, "Playfair Display", serif;
            font-size: 38px;
            font-weight: 700;
            letter-spacing: -0.5px;
            margin: 0 0 16px 0;
            color: #1a1614;
          }
          .cover-subtitle {
            font-size: 16px;
            color: #635b54;
            margin-bottom: 40px;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          .cover-meta {
            font-size: 14px;
            color: #8c827a;
            border-top: 1px solid #e8e2dc;
            padding-top: 24px;
            width: 240px;
          }
          
          .page-container {
            page-break-after: always;
            min-height: 90vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding-top: 10px;
          }
          .page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #e8e2dc;
            padding-bottom: 8px;
            margin-bottom: 24px;
            font-size: 12px;
            color: #8c827a;
            font-family: -apple-system, sans-serif;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .page-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .image-wrapper {
            width: 100%;
            text-align: center;
            background: #faf7f4;
            border-radius: 8px;
            padding: 12px;
            border: 1px solid #ede8e3;
          }
          .page-image {
            max-width: 100%;
            max-height: 440px;
            object-fit: contain;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          }
          .transcription-wrapper {
            background-color: #faf7f4;
            border-radius: 8px;
            padding: 18px 22px;
            border: 1px solid #ede8e3;
          }
          .transcription-heading {
            font-size: 10px;
            letter-spacing: 1.5px;
            color: #8c827a;
            margin: 0 0 10px 0;
            font-family: -apple-system, sans-serif;
          }
          .transcription-body {
            font-family: Georgia, serif;
            font-size: 15px;
            line-height: 1.65;
            color: #2b2622;
          }
          .page-footer {
            display: flex;
            justify-content: space-between;
            border-top: 1px solid #f0ebe6;
            padding-top: 10px;
            margin-top: 20px;
            font-size: 11px;
            color: #a89f97;
            font-family: -apple-system, sans-serif;
          }
        </style>
      </head>
      <body>
        <!-- Cover Page -->
        <div class="cover-page">
          <h1 class="cover-title">${escapeHtml(journalTitle)}</h1>
          <div class="cover-subtitle">${pages.length} Archived Page${pages.length === 1 ? "" : "s"}</div>
          <div class="cover-meta">
            Exported on ${formattedDate}
          </div>
        </div>

        <!-- Pages -->
        ${pagesHtml}
      </body>
    </html>
  `;

  onProgress?.("Rendering PDF document…");

  // 4. Render to PDF using Expo Print
  const { uri } = await Print.printToFileAsync({
    html: fullHtml,
    base64: false,
  });

  onProgress?.("Opening sharing options…");

  // 5. Present system share dialog
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      UTI: ".pdf",
      mimeType: "application/pdf",
      dialogTitle: `Export "${journalTitle}" as PDF`,
    });
  }

  return uri;
}
