import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  AlignmentType, ImageRun, PageBreak, Header, Footer } from 'docx';

/**
 * Converte il DOM prodotto da ProseMirror (editorView.dom) in un documento .docx
 * fedele: titoli, grassetto/corsivo/sottolineato, elenchi, tabelle, immagini, allineamento.
 */
export async function exportToDocx(editorView, { titolo = 'Documento', headerText = '', footerText = '' } = {}) {
  const dom = editorView.dom;
  const children = await Promise.all(Array.from(dom.children).map(nodeToDocxElement));

  const doc = new Document({
    sections: [{
      properties: {},
      headers: headerText ? { default: makeHeaderFooter(headerText, false) } : undefined,
      footers: footerText ? { default: makeHeaderFooter(footerText, true) } : undefined,
      children: children.flat().filter(Boolean)
    }]
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${sanitizeFilename(titolo)}.docx`);
}

function makeHeaderFooter(text, isFooter = false) {
  const Ctor = isFooter ? Footer : Header;
  return new Ctor({ children: [new Paragraph({ children: [new TextRun(text)] })] });
}

async function nodeToDocxElement(el) {
  const tag = el.tagName?.toLowerCase();

  switch (tag) {
    case 'h1': return new Paragraph({ text: el.textContent, heading: HeadingLevel.HEADING_1 });
    case 'h2': return new Paragraph({ text: el.textContent, heading: HeadingLevel.HEADING_2 });
    case 'h3': return new Paragraph({ text: el.textContent, heading: HeadingLevel.HEADING_3 });

    case 'p': return new Paragraph({
      alignment: alignmentFromStyle(el),
      children: runsFromInline(el)
    });

    case 'ul': case 'ol':
      return Array.from(el.children).map((li, i) =>
        new Paragraph({
          bullet: tag === 'ul' ? { level: 0 } : undefined,
          numbering: tag === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
          children: runsFromInline(li)
        })
      );

    case 'table':
      return new Table({
        rows: Array.from(el.querySelectorAll('tr')).map(tr =>
          new TableRow({
            children: Array.from(tr.children).map(td =>
              new TableCell({ children: [new Paragraph({ children: runsFromInline(td) })] })
            )
          })
        )
      });

    case 'hr':
      return new Paragraph({ children: [new PageBreak()] });

    case 'img': {
      try {
        const data = await fetchImageBuffer(el.src);
        return new Paragraph({
          children: [new ImageRun({ data, transformation: { width: 400, height: 300 } })]
        });
      } catch { return new Paragraph({ text: '[immagine non incorporabile]' }); }
    }

    default:
      return el.textContent ? new Paragraph({ text: el.textContent }) : null;
  }
}

function alignmentFromStyle(el) {
  const align = el.style?.textAlign;
  if (align === 'center') return AlignmentType.CENTER;
  if (align === 'right') return AlignmentType.RIGHT;
  if (align === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function runsFromInline(el) {
  const runs = [];
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim() === '' && node.textContent !== ' ') return;
      runs.push(new TextRun({ text: node.textContent }));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const t = node.tagName.toLowerCase();
    const bold = t === 'strong' || t === 'b' || !!node.closest?.('strong,b');
    const italics = t === 'em' || t === 'i';
    const underline = t === 'u' ? {} : undefined;
    const color = node.style?.color ? node.style.color.replace('#', '') : undefined;
    runs.push(new TextRun({ text: node.textContent, bold, italics, underline, color }));
  });
  return runs.length ? runs : [new TextRun({ text: el.textContent || '' })];
}

async function fetchImageBuffer(src) {
  const res = await fetch(src);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_\-. àèéìòù]/gi, '_').slice(0, 80) || 'documento';
}
