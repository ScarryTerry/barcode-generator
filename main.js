const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const QRCode = require('qrcode');
require('dotenv').config();

let mainWindow;


function createWindow() {
  mainWindow = new BrowserWindow({
  width: 113.04,
  height: 67.68, // Slightly taller to accommodate styling safely
  title: "Генератор пакетів штрих-кодів та QR-кодів",
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js')
  }
});

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

// Handle directory selection dialog
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

// Main Generation Logic
ipcMain.handle('generate-batch', async (event, data) => {
  const { name, batchNumber, amount, saveDir } = data;
  
  try {
    const pdfPath = path.join(saveDir, `${name}_${batchNumber}_barcodes.pdf`);
    const qrPath = path.join(saveDir, `${name}_${batchNumber}_qr.jpg`);

    const labelWidth = 113.04;  // 1.57 inches
    const labelHeight = 67.68;  // 0.94 inches

    const doc = new PDFDocument({ 
      size: [labelWidth, labelHeight], 
      margins: { top: 0, bottom: 0, left: 0, right: 0 } 
    });
    
    const pdfStream = fs.createWriteStream(pdfPath);
    doc.pipe(pdfStream);

    // --- FIX: Register and apply local Unicode Font ---
    const fontPath = path.join(__dirname, 'fonts', 'arial.ttf');

    if (fs.existsSync(fontPath)) {
    // We register it explicitly as 'Arial-Cyrillic' to force PDFKit to generate a clean UTF-8 subset
    doc.registerFont('Arial-Cyrillic', fontPath);
    doc.font('Arial-Cyrillic');
    } else {
    throw new Error(`Font asset missing at: ${fontPath}`);
    }

    const barcodeList = [];

    for (let i = 1; i <= amount; i++) {
  const currentId = `${batchNumber}/${i}`;
  barcodeList.push(currentId);

  if (i > 1) {
    doc.addPage({ 
      size: [labelWidth, labelHeight], 
      margins: { top: 0, bottom: 0, left: 0, right: 0 } 
    });
  }

  // 1. --- Render the Name (with Dynamic Font Size) ---
  // If the name is longer than 20 characters, drop size to 5, otherwise keep it at 6
  const nameFontSize = name.length > 20 ? 5 : 6;
  doc.fontSize(nameFontSize);
  
  doc.text(`${name}`, 0, 3, { width: labelWidth, align: 'center' });
  
  // PDFKit will accurately measure the height using whatever font size was just applied
  const nameHeight = doc.heightOfString(`${name}`, { width: labelWidth });

  // 2. --- NEW: Render Manufacturer ("Виробник") ---
  const manufacturerText = `Виробник: ${process.env.MANUFACTURER_NAME || 'Компанія відсутня'}`;
  const manufacturerY = 3 + nameHeight + 1; 
  
  doc.fontSize(5).text(manufacturerText, 0, manufacturerY, { width: labelWidth, align: 'center' });
  const manufacturerHeight = doc.heightOfString(manufacturerText, { width: labelWidth });

  // 3. --- Render Batch Number (Italicized) ---
  const batchY = manufacturerY + manufacturerHeight + 1; 
  doc.fontSize(5).text(`Партія: ${batchNumber}`, 0, batchY, { 
    width: labelWidth, 
    align: 'center',
    oblique: true 
  });

  // 4. --- Generate & Render Barcode ---
  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: 'code128',       
    text: currentId,       
    scale: 1.5,             
    height: 5,             // Slightly compressed to accommodate the new line
    includetext: false,    
  });

  const barcodeRenderWidth = 90; 
  const barcodeX = (labelWidth - barcodeRenderWidth) / 2;
  
  // 5 points for batch text height + 3 points gap
  const barcodeY = batchY + 5 + 3; 
  const barcodeRenderHeight = 8; 

  doc.image(barcodeBuffer, barcodeX, barcodeY, { 
    width: barcodeRenderWidth,
    height: barcodeRenderHeight 
  });
  
  // 5. --- Footer ---
  const footerY = barcodeY + barcodeRenderHeight + 2;
  doc.fontSize(5).text(`${currentId}`, 0, footerY, { width: labelWidth, align: 'center' });
}
    
    doc.end();

    // 2. Generate Batch QR Code
    const qrContent = barcodeList.join(' ');
    await QRCode.toFile(qrPath, qrContent, {
      errorCorrectionLevel: 'M',
      type: 'jpeg',
      width: 600, 
      rendererOpts: { quality: 0.95 }
    });

    return { success: true, pdfPath, qrPath };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
