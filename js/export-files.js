// ---------- exportação: gravação de arquivos ----------
// Escritores mínimos para PDF (uma imagem JPEG por página) e ZIP (sem compressão: PNG já é comprimido).
// Evitam dependências extras: jsPDF e JSZip pesam muito mais do que este código inteiro.
const ExportFiles = (() => {
  const enc = new TextEncoder();

  // ---------- CRC32 ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ---------- ZIP ----------
  // files: [{ name, data: Uint8Array }]
  function zip(files) {
    const chunks = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const file of files) {
      const name = enc.encode(file.name);
      const crc = crc32(file.data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // nomes em UTF-8
      local.setUint16(8, 0, true);      // sem compressão
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, file.data.length, true);
      local.setUint32(22, file.data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), name, file.data);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true);
      cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, file.data.length, true);
      cd.setUint32(24, file.data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + file.data.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  // ---------- PDF ----------
  // pages: [{ jpeg: Uint8Array, width, height (px da imagem), pw, ph (pontos da página) }]
  function pdf(pages, { title = 'Roteiro' } = {}) {
    const parts = [];
    const offsets = [];
    let size = 0;
    const push = (data) => { const b = typeof data === 'string' ? enc.encode(data) : data; parts.push(b); size += b.length; };
    const object = (num, body) => { offsets[num] = size; push(`${num} 0 obj\n${body}\nendobj\n`); };
    const hex16 = (text) => `<FEFF${[...String(text)].map((ch) => ch.codePointAt(0).toString(16).padStart(4, '0')).join('').toUpperCase()}>`;
    const utf16 = (text) => {
      // codePoints acima de 0xFFFF viram pares substitutos
      let out = '';
      for (let i = 0; i < text.length; i++) out += text.charCodeAt(i).toString(16).padStart(4, '0');
      return `<FEFF${out.toUpperCase()}>`;
    };
    const f = (n) => (Math.round(n * 100) / 100).toString();

    push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const kids = pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ');
    object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    object(3, `<< /Title ${utf16(title)} /Producer (Mundo Afora) /Creator (Mundo Afora) /CreationDate (${stamp}) >>`);
    pages.forEach((p, i) => {
      const pageNum = 4 + i * 3, contentNum = pageNum + 1, imageNum = pageNum + 2;
      object(pageNum, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.pw)} ${f(p.ph)}] /Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>`);
      const content = `q ${f(p.pw)} 0 0 ${f(p.ph)} 0 0 cm /Im0 Do Q`;
      object(contentNum, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      offsets[imageNum] = size;
      push(`${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream\nendobj\n');
    });
    const total = 4 + pages.length * 3;
    const xref = size;
    let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    push(table);
    push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return { zip, pdf, download, crc32 };
})();
