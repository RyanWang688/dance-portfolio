// Fetch static instances of the site's fonts from Google Fonts (CSS API returns TTF for non-browser clients).
import fs from 'fs';
import path from 'path';
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const want = {
  'ArchivoXItalic900.ttf': 'Archivo:ital,wdth,wght@1,125,900',
  'ArchivoX800.ttf': 'Archivo:wdth,wght@125,800',
  'Archivo600.ttf': 'Archivo:wght@600',
  'JetBrainsMono500.ttf': 'JetBrains+Mono:wght@500',
};
for (const [file, fam] of Object.entries(want)) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}`)).text();
  const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
  if (!urls.length) throw new Error('no url for ' + fam + '\n' + css.slice(0, 300));
  // last block is usually the latin subset
  const u = urls[urls.length - 1];
  const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
  fs.writeFileSync(path.join(out, file), buf);
  console.log(file, buf.length, u.slice(-40));
}
