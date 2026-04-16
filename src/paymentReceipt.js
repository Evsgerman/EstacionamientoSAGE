const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');

const logoPath = path.join(__dirname, '..', 'public', 'assets', 'sage-logo.svg');

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function buildFilename(payment) {
  const safeName = String(payment.tenantName || 'inquilino')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `comprobante-${payment.receiptFolio || payment.id}-${safeName}.pdf`;
}

function drawLabelValue(doc, label, value, x, y, width) {
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#8B4D15')
    .text(label, x, y, { width })
    .moveDown(0.25)
    .font('Helvetica')
    .fontSize(12)
    .fillColor('#1F1A17')
    .text(value, x, doc.y, { width });
}

function generatePaymentReceiptPdf(res, payment) {
  const doc = new PDFDocument({ size: 'A4', margin: 42 });
  const filename = buildFilename(payment);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  doc.pipe(res);

  doc.roundedRect(24, 24, 547, 795, 24).fillAndStroke('#FFF9F1', '#E4D5C3');

  if (fs.existsSync(logoPath)) {
    const logoSvg = fs.readFileSync(logoPath, 'utf8');
    SVGtoPDF(doc, logoSvg, 46, 38, { width: 220, height: 78, assumePt: true });
  } else {
    doc.font('Helvetica-Bold').fontSize(28).fillColor('#1F1A17').text('SAGE', 46, 52);
    doc.font('Helvetica-Oblique').fontSize(16).fillColor('#4E4A46').text('ESTACIONAMIENTO', 46, 86);
  }

  doc
    .roundedRect(380, 44, 150, 70, 18)
    .fillAndStroke('#F6E5D4', '#D9B998');

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#8B4D15')
    .text('COMPROBANTE', 402, 60, { width: 108, align: 'center' })
    .fontSize(15)
    .fillColor('#1F1A17')
    .text(payment.receiptFolio || `PAGO-${payment.id}`, 394, 79, { width: 124, align: 'center' });

  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#1F1A17')
    .text('Comprobante de pago de pension', 46, 138)
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#6B6258')
    .text('Documento emitido cuando el inquilino liquida por completo su pension mensual.', 46, 168, {
      width: 485
    });

  doc
    .roundedRect(46, 210, 485, 112, 20)
    .fillAndStroke('#FFFFFF', '#E4D5C3');

  drawLabelValue(doc, 'Inquilino', payment.tenantName, 64, 230, 190);
  drawLabelValue(doc, 'Placa', payment.plate, 262, 230, 120);
  drawLabelValue(doc, 'Cajon', String(payment.assignedSpotNumber || 'Sin asignar'), 394, 230, 110);
  drawLabelValue(doc, 'Metodo de pago', payment.paymentMethod, 64, 280, 190);
  drawLabelValue(doc, 'Fecha de pago', formatDate(payment.paidAt), 262, 280, 242);

  doc
    .roundedRect(46, 344, 232, 128, 20)
    .fillAndStroke('#FFF4EA', '#E4D5C3');

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#8B4D15')
    .text('Monto pagado', 64, 364)
    .fontSize(30)
    .fillColor('#B4142F')
    .text(formatCurrency(payment.amount), 64, 388)
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#6B6258')
    .text(payment.concept, 64, 428, { width: 186 });

  doc
    .roundedRect(298, 344, 233, 128, 20)
    .fillAndStroke('#F2F8F7', '#D4E0DD');

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#277253')
    .text('Saldo posterior al pago', 316, 364)
    .fontSize(30)
    .fillColor('#277253')
    .text(formatCurrency(payment.balanceAfter), 316, 388)
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#1F1A17')
    .text(payment.paidInFull ? 'Pension liquidada por completo' : 'Pago parcial registrado', 316, 430, { width: 185 });

  doc
    .roundedRect(46, 494, 485, 180, 20)
    .fillAndStroke('#FFFFFF', '#E4D5C3');

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#1F1A17')
    .text('Resumen del comprobante', 64, 516)
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#4E4A46')
    .text(
      `Se recibio el pago de ${formatCurrency(payment.amount)} correspondiente a la pension del cajon ${payment.assignedSpotNumber || 'sin asignar'}. El movimiento fue registrado con el folio ${payment.receiptFolio || payment.id} y el saldo del inquilino quedo en ${formatCurrency(payment.balanceAfter)}.`,
      64,
      544,
      { width: 450, lineGap: 4 }
    );

  doc
    .moveTo(64, 648)
    .lineTo(250, 648)
    .strokeColor('#D4B394')
    .stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#8B4D15')
    .text('Validado por SAGE Estacionamiento', 64, 656)
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#6B6258')
    .text('Este comprobante se genera automaticamente desde el sistema administrativo.', 64, 672, { width: 280 });

  doc
    .roundedRect(46, 708, 485, 72, 18)
    .fillAndStroke('#1F1A17', '#1F1A17');

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#FFFFFF')
    .text('SAGE Estacionamiento', 64, 726)
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#EDE6DD')
    .text('Comprobante emitido en formato PDF para control interno y entrega al inquilino.', 64, 746, {
      width: 420
    });

  doc.end();
}

module.exports = {
  generatePaymentReceiptPdf
};