const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

async function buildIcon() {
  console.log('Processing icon...');
  
  const sourceIcon = path.join(__dirname, '../assets/icon.png');
  const tempSquare = path.join(__dirname, '../assets/icon-square-temp.png');
  const targetIco = path.join(__dirname, '../assets/icon.ico');

  if (!fs.existsSync(sourceIcon)) {
    console.error(`Source icon not found at ${sourceIcon}`);
    console.error('Please place your desired icon image at assets/icon.png');
    process.exit(1);
  }

  try {
    // 1. Resize to a perfect square (256x256) with transparent padding if needed
    await sharp(sourceIcon)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFile(tempSquare);

    // 2. Convert the perfectly square PNG to an ICO file
    const pngToIcoModule = await import('png-to-ico');
    const pngToIcoFn = pngToIcoModule.default;
    const buf = await pngToIcoFn(tempSquare);
    fs.writeFileSync(targetIco, buf);

    // 3. Cleanup the temporary square file
    fs.unlinkSync(tempSquare);
    console.log('Icon successfully generated at assets/icon.ico');
  } catch (err) {
    console.error('Failed to process icon:', err);
    process.exit(1);
  }
}

buildIcon();
