// Content handling: sanitising stored HTML and converting uploaded files into it.
import sanitizeHtml from 'sanitize-html';
import mammoth from 'mammoth';
import { marked } from 'marked';
import path from 'node:path';

// Allow only what the editor can produce. Anything else is stripped, so a
// crafted API call can't store <script>/<img onerror> etc. for other users.
const SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
  ],
  allowedAttributes: {},
  transformTags: { b: 'strong', i: 'em' },
};

export function sanitizeContent(html) {
  return sanitizeHtml(String(html ?? ''), SANITIZE_OPTIONS);
}

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.docx'];
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function textToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Convert an uploaded file into sanitised editor HTML.
 * @returns {Promise<{title: string, html: string}>}
 * @throws {Error & {status: number}} for unsupported or unreadable files
 */
export async function fileToDocument({ originalname: rawName, buffer }) {
  // multer 1.x decodes multipart filenames as latin1; browsers send UTF-8.
  const originalname = rawName ? Buffer.from(rawName, 'latin1').toString('utf8') : rawName;
  const ext = path.extname(originalname || '').toLowerCase();
  const title = path.basename(originalname || 'Imported document', ext).slice(0, 200) || 'Imported document';
  let html;

  if (ext === '.txt') {
    html = textToHtml(buffer.toString('utf8'));
  } else if (ext === '.md') {
    html = await marked.parse(buffer.toString('utf8'));
  } else if (ext === '.docx') {
    try {
      ({ value: html } = await mammoth.convertToHtml({ buffer }));
    } catch {
      throw Object.assign(new Error('Could not read this .docx file. Is it a valid Word document?'), { status: 400 });
    }
  } else {
    throw Object.assign(
      new Error(`Unsupported file type "${ext || 'none'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`),
      { status: 415 },
    );
  }

  return { title, html: sanitizeContent(html) };
}
