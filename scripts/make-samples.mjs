/**
 * Generates the bundled sample labels (web/public/samples/): renders each
 * label as SVG, rasterizes to PNG with sharp, and writes samples.json with
 * the matching application data. Run: npm run samples
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public', 'samples')

const WARNING_EXACT =
  'GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink ' +
  'alcoholic beverages during pregnancy because of the risk of birth defects. ' +
  '(2) Consumption of alcoholic beverages impairs your ability to drive a car or ' +
  'operate machinery, and may cause health problems.'

const WARNING_TITLE_CASE = WARNING_EXACT.replace('GOVERNMENT WARNING:', 'Government Warning:')
const WARNING_REWORDED = WARNING_EXACT.replace(
  'women should not drink alcoholic beverages during pregnancy because of the risk of birth defects',
  'drinking alcoholic beverages during pregnancy can cause birth defects',
)

const W = 900
const H = 1300

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrap(text, maxChars) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? line + ' ' + word : word
    }
  }
  if (line) lines.push(line)
  return lines
}

function warningBlock(warningText, y) {
  if (!warningText) return ''
  const lines = wrap(warningText, 74)
  const prefixMatch = warningText.match(/^(government warning:)/i)
  const prefix = prefixMatch ? prefixMatch[1] : ''
  let svg = `<rect x="55" y="${y - 34}" width="${W - 110}" height="${lines.length * 26 + 52}" fill="none" stroke="#1a1a1a" stroke-width="2"/>`
  lines.forEach((line, i) => {
    let content
    if (i === 0 && prefix && line.startsWith(prefix)) {
      const rest = line.slice(prefix.length).replace(/^ /, ' ')
      content = `<tspan font-weight="bold">${esc(prefix)}</tspan><tspan>${esc(rest)}</tspan>`
    } else {
      content = esc(line)
    }
    svg += `<text x="75" y="${y + i * 26}" font-family="Helvetica, Arial, sans-serif" font-size="19" fill="#1a1a1a">${content}</text>`
  })
  return svg
}

function label({
  brand,
  brandSize = 74,
  script = false,
  classType,
  abv,
  net,
  producer,
  origin = '',
  warning,
  bg = '#f4efe4',
  accent = '#7a1f1f',
  ink = '#221a12',
}) {
  const brandFont = script
    ? 'Snell Roundhand, Brush Script MT, cursive'
    : 'Trebuchet MS, Georgia, serif'
  const classLines = wrap(classType.toUpperCase(), 30)
  const classSvg = classLines
    .map(
      (line, i) =>
        `<text x="${W / 2}" y="${470 + i * 44}" text-anchor="middle" font-family="Georgia, serif" font-size="36" letter-spacing="4" fill="${ink}">${esc(line)}</text>`,
    )
    .join('')
  const originSvg = origin
    ? `<text x="${W / 2}" y="905" text-anchor="middle" font-family="Georgia, serif" font-size="26" font-style="italic" fill="${ink}">${esc(origin)}</text>`
    : ''
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="${accent}" stroke-width="6"/>
  <rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="${accent}" stroke-width="2"/>
  <circle cx="${W / 2}" cy="200" r="70" fill="none" stroke="${accent}" stroke-width="4"/>
  <text x="${W / 2}" y="216" text-anchor="middle" font-family="Georgia, serif" font-size="46" fill="${accent}">✦</text>
  <text x="${W / 2}" y="382" text-anchor="middle" font-family="${brandFont}" font-size="${brandSize}" font-weight="bold" fill="${accent}">${esc(brand)}</text>
  ${classSvg}
  <line x1="180" y1="620" x2="${W - 180}" y2="620" stroke="${accent}" stroke-width="3"/>
  <text x="${W / 2}" y="700" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="${ink}">${esc(abv)}</text>
  <text x="${W / 2}" y="762" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="${ink}">${esc(net)}</text>
  <text x="${W / 2}" y="855" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="${ink}">${esc(producer)}</text>
  ${originSvg}
  ${warningBlock(warning, 1010)}
</svg>`
}

const OLD_TOM = {
  brand: 'OLD TOM DISTILLERY',
  brandSize: 64,
  classType: 'Kentucky Straight Bourbon Whiskey',
  abv: '45% Alc./Vol. (90 Proof)',
  net: '750 mL',
  producer: 'Distilled and Bottled by Old Tom Distillery Co., Bardstown, KY',
}

const OLD_TOM_APP = {
  brandName: 'OLD TOM DISTILLERY',
  classType: 'Kentucky Straight Bourbon Whiskey',
  alcoholContent: '45% Alc./Vol. (90 Proof)',
  netContents: '750 mL',
  producer: 'Old Tom Distillery Co., Bardstown, KY',
  countryOfOrigin: '',
}

const samples = [
  {
    id: 'old-tom-compliant',
    title: 'Old Tom Bourbon — fully compliant',
    file: 'old-tom-compliant.png',
    expect: 'PASS',
    description: 'Everything on the label matches the application, and the government warning is word-perfect.',
    application: OLD_TOM_APP,
    svg: label({ ...OLD_TOM, warning: WARNING_EXACT }),
  },
  {
    id: 'title-case-warning',
    title: 'Title-case government warning',
    file: 'title-case-warning.png',
    expect: 'FAIL',
    description: '"Government Warning:" is not in all capital letters — a real rejection agents catch by eye.',
    application: OLD_TOM_APP,
    svg: label({ ...OLD_TOM, warning: WARNING_TITLE_CASE }),
  },
  {
    id: 'missing-warning',
    title: 'Missing government warning',
    file: 'missing-warning.png',
    expect: 'FAIL',
    description: 'The mandatory health warning statement is absent from the label.',
    application: OLD_TOM_APP,
    svg: label({ ...OLD_TOM, warning: null }),
  },
  {
    id: 'reworded-warning',
    title: 'Reworded government warning',
    file: 'reworded-warning.png',
    expect: 'FAIL',
    description: 'The warning is present and looks official, but the wording deviates from the statutory text.',
    application: OLD_TOM_APP,
    svg: label({ ...OLD_TOM, warning: WARNING_REWORDED }),
  },
  {
    id: 'wrong-abv',
    title: 'Wrong alcohol content',
    file: 'wrong-abv.png',
    expect: 'FAIL',
    description: 'The application says 45% ABV but the label reads 40% — a classic data-entry mismatch.',
    application: OLD_TOM_APP,
    svg: label({ ...OLD_TOM, abv: '40% Alc./Vol. (80 Proof)', warning: WARNING_EXACT }),
  },
  {
    id: 'stones-throw',
    title: "STONE'S THROW vs Stone's Throw",
    file: 'stones-throw.png',
    expect: 'PASS',
    description:
      'The label shouts the brand in capitals while the application uses title case — same brand, so it should pass with a note, not a rejection.',
    application: {
      brandName: "Stone's Throw",
      classType: 'Straight Rye Whiskey',
      alcoholContent: '50% Alc./Vol. (100 Proof)',
      netContents: '750 mL',
      producer: "Stone's Throw Spirits, Hudson, NY",
      countryOfOrigin: '',
    },
    svg: label({
      brand: "STONE'S THROW",
      brandSize: 68,
      classType: 'Straight Rye Whiskey',
      abv: '50% Alc./Vol. (100 Proof)',
      net: '750 mL',
      producer: "Distilled and Bottled by Stone's Throw Spirits, Hudson, NY",
      warning: WARNING_EXACT,
      bg: '#eef0ea',
      accent: '#24421f',
    }),
  },
  {
    id: 'chateau-import',
    title: 'Imported wine — compliant',
    file: 'chateau-import.png',
    expect: 'PASS',
    description: 'A French wine with country of origin declared; net contents written as 750ML.',
    application: {
      brandName: 'Château Belmont',
      classType: 'Red Bordeaux Wine',
      alcoholContent: '13.5% Alc./Vol.',
      netContents: '750 mL',
      producer: 'Imported by Belmont Imports LLC, New York, NY',
      countryOfOrigin: 'Product of France',
    },
    svg: label({
      brand: 'Château Belmont',
      brandSize: 78,
      script: true,
      classType: 'Red Bordeaux Wine',
      abv: '13.5% Alc./Vol.',
      net: '750ML',
      producer: 'Imported by Belmont Imports LLC, New York, NY',
      origin: 'Product of France',
      warning: WARNING_EXACT,
      bg: '#f7f3ea',
      accent: '#3d2a4d',
    }),
  },
  {
    id: 'bad-photo',
    title: 'Poorly photographed label',
    file: 'bad-photo.png',
    expect: 'PASS',
    description:
      'The compliant Old Tom label, but photographed at an angle with blur and dim lighting — the tool should still read it, or honestly say it needs a human eye.',
    application: OLD_TOM_APP,
    svg: label({ ...OLD_TOM, warning: WARNING_EXACT }),
    distort: true,
  },
]

await mkdir(OUT, { recursive: true })

for (const sample of samples) {
  let image = sharp(Buffer.from(sample.svg)).flatten({ background: '#c9c4ba' })
  if (sample.distort) {
    image = sharp(await image.png().toBuffer())
      .rotate(5, { background: '#8f8a80' })
      .blur(1.4)
      .modulate({ brightness: 0.82, saturation: 0.85 })
      .resize({ width: 760 })
  }
  await image.png().toFile(path.join(OUT, sample.file))
  console.log('wrote', sample.file)
}

const manifest = samples.map(({ svg: _svg, distort: _d, ...rest }) => rest)
await writeFile(path.join(OUT, 'samples.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('wrote samples.json —', manifest.length, 'samples')
