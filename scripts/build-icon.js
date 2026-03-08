const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Windows uses all of these sizes depending on context:
// 16 = small icons in explorer/taskbar, 24 = small toolbar, 32 = medium explorer,
// 48 = large explorer, 64 = extra-large, 128 = jumbo, 256 = high-DPI/details view
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function buildIcon() {
  console.log('Processing icon...');

  const sourceIcon = path.join(__dirname, '../assets/icon.png');
  const targetIco = path.join(__dirname, '../assets/icon.ico');
  const tempDir = path.join(__dirname, '../assets/.icon-tmp');

  if (!fs.existsSync(sourceIcon)) {
    console.error(`Source icon not found at ${sourceIcon}`);
    console.error('Please place your desired icon image at assets/icon.png');
    process.exit(1);
  }

  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 1. Generate a perfectly square PNG for each required size
    const tempFiles = [];
    for (const size of ICO_SIZES) {
      const tempFile = path.join(tempDir, `icon-${size}.png`);
      await sharp(sourceIcon)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(tempFile);
      tempFiles.push(tempFile);
    }

    // 2. Combine all sizes into a single ICO file
    const pngToIcoModule = await import('png-to-ico');
    const pngToIcoFn = pngToIcoModule.default;
    const buf = await pngToIcoFn(tempFiles);
    fs.writeFileSync(targetIco, buf);

    console.log(`Icon generated with sizes: ${ICO_SIZES.join(', ')}px → assets/icon.ico`);
  } catch (err) {
    console.error('Failed to process icon:', err);
    process.exit(1);
  } finally {
    // 3. Cleanup temp files
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

buildIcon();
