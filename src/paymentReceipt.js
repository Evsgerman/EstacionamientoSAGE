const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const QRCode = require('qrcode');

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

function formatPaidMonth(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return 'Mes no especificado';
  }

  const label = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(`${normalized}-01T12:00:00`));

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildFilename(payment) {
  const safeName = String(payment.tenantName || 'inquilino')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `comprobante-${payment.receiptFolio || payment.id}-${safeName}.pdf`;
}

function buildCaptureLine(payment) {
  if (payment.captureLine) {
    return payment.captureLine;
  }

  const paidMonth = String(payment.paidMonth || new Date(payment.paidAt || Date.now()).toISOString().slice(0, 7)).replace('-', '');
  return `LCSAGE-${paidMonth}-${String(payment.tenantId || 0).padStart(4, '0')}-${String(payment.id || 0).padStart(6, '0')}`;
}

function buildReceiptNote(payment) {
  return payment.receiptNote || 'IMPORTANTE:El estacionamiento NO se hace responsable de los danos, robo parcial o total de su vehiculo, asi como, de los objetos olvidados dentro del mismo. Estos codigos de verificacion contienen los datos encriptados del recibo y se utilizan para validar la integridad de los mismos; El presente boleto solo avala la recepcion del monto por el concepto expresado en el mismo y en ningun momento exime de cualquier otro adeudo o pendiente de pago que se tenga.';
}

function buildQrText(payment) {
  return [
    'SAGE Estacionamiento',
    `Folio: ${payment.receiptFolio || payment.id}`,
    `Inquilino: ${payment.tenantName}`,
    `Monto pagado: ${formatCurrency(payment.amount)}`,
    `Mes pagado: ${formatPaidMonth(payment.paidMonth)}`,
    `Linea de captura: ${buildCaptureLine(payment)}`
  ].join('\n');
}

function drawLabelValue(doc, label, value, x, y, width) {
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#7A5C3E')
    .text(label, x, y, { width })
    .moveDown(0.25)
    .font('Helvetica')
    .fontSize(12)
    .fillColor('#2E2623')
    .text(value, x, doc.y, { width });
}

async function generatePaymentReceiptPdf(res, payment) {
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  const filename = buildFilename(payment);
  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: buildCaptureLine(payment),
    scale: 2,
    height: 14,
    includetext: false,
    backgroundcolor: 'FFFFFF'
  });
  const qrBuffer = await QRCode.toBuffer(buildQrText(payment), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 164,
    color: {
      dark: '#1F1A17',
      light: '#0000'
    }
  });
  const paymentMonthLabel = formatPaidMonth(payment.paidMonth);
  const receiptNote = buildReceiptNote(payment);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

  doc.pipe(res);

  doc.roundedRect(24, 24, 547, 795, 24).fillAndStroke('#FCF8F3', '#CDB9A4');

  doc
    .roundedRect(380, 44, 150, 70, 18)
    .fillAndStroke('#EADFD6', '#B69A80');

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#7B6247')
    .text('COMPROBANTE', 402, 60, { width: 108, align: 'center' })
    .fontSize(15)
    .fillColor('#5D2F3A')
    .text(payment.receiptFolio || `PAGO-${payment.id}`, 394, 79, { width: 124, align: 'center' });

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#5D2F3A')
    .text('Comprobante de pago de pension', 46, 58);

  doc
    .roundedRect(46, 152, 485, 118, 20)
    .fillAndStroke('#FFFFFF', '#D8C9BB');

  drawLabelValue(doc, 'Inquilino', payment.tenantName, 64, 170, 190);
  drawLabelValue(doc, 'Placa', payment.plate, 262, 170, 120);
  drawLabelValue(doc, 'Cajon', String(payment.assignedSpotNumber || 'Sin asignar'), 394, 170, 110);
  drawLabelValue(doc, 'Metodo de pago', payment.paymentMethod, 64, 218, 190);
  drawLabelValue(doc, 'Fecha de pago', formatDate(payment.paidAt), 262, 218, 136);
  drawLabelValue(doc, 'Mes pagado', paymentMonthLabel, 406, 218, 108);

  doc
    .roundedRect(46, 300, 150, 112, 20)
    .fillAndStroke('#F6E8E2', '#C8A394');

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#7C5A45')
    .text('Monto pagado', 64, 318)
    .fontSize(30)
    .fillColor('#8B2E3C')
    .text(formatCurrency(payment.amount), 64, 342);

  doc
    .roundedRect(210, 300, 150, 112, 20)
    .fillAndStroke('#F3EBDD', '#C6B08A');

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#78624A')
    .text('Mes que se paga', 228, 318)
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor('#5F4837')
    .text(paymentMonthLabel, 228, 344, { width: 118 });

  doc
    .roundedRect(374, 300, 157, 146, 20)
    .fillAndStroke('#EDF2F4', '#9BAEB7');

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#465B67')
    .text('Codigo QR de validacion', 390, 316, { width: 125, align: 'center' });

  doc.image(qrBuffer, 402, 342, { fit: [96, 96], align: 'center', valign: 'center' });

  doc
    .roundedRect(46, 464, 485, 96, 20)
    .fillAndStroke('#F3F1F4', '#AAA1B3');

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#5A5368')
    .text('Codigo de barras de validacion', 64, 480)

  doc.image(barcodeBuffer, 96, 504, { fit: [384, 28], align: 'center', valign: 'center' });

  doc
    .roundedRect(46, 582, 485, 114, 18)
    .fillAndStroke('#F6F0E3', '#C7B08A');

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#4F433B')
    .text(receiptNote, 64, 596, { width: 450, lineGap: 2, align: 'justify' });

  doc.end();
}

module.exports = {
  generatePaymentReceiptPdf
};