import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Esporta la pagina esattamente come composta (incluse intestazioni/piè di pagina
 * renderizzati nel DOM) rasterizzando #page-container ad alta risoluzione
 * e componendo un PDF A4 multipagina fedele al layout visivo.
 */
export async function exportToPdf(pageRootEl, { titolo = 'documento' } = {}) {
  const canvas = await html2canvas(pageRootEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff'
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const imgWidthMm = pageWidthMm;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  let heightLeft = imgHeightMm;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidthMm, imgHeightMm);
  heightLeft -= pageHeightMm;

  while (heightLeft > 0) {
    position = heightLeft - imgHeightMm;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidthMm, imgHeightMm);
    heightLeft -= pageHeightMm;
  }

  pdf.save(`${sanitizeFilename(titolo)}.pdf`);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_\-. àèéìòù]/gi, '_').slice(0, 80) || 'documento';
}
