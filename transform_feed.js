const https = require('https');
const fs = require('fs');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

const SOURCE_URL = 'https://www.yarmi.sk/google/export/products.xml';

const GENDER_MAP = {
  'Ženy': 'female',
  'Muži': 'male',
  'Unisex': 'unisex',
};

function fetchXML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function getDetail(details, name) {
  if (!details) return null;
  const arr = Array.isArray(details) ? details : [details];
  const found = arr.find(d => d['g:attribute_name'] === name);
  return found ? found['g:attribute_value'] : null;
}

async function transformFeed() {
  console.log('Downloading feed from Shoptet...');
  const xml = await fetchXML(SOURCE_URL);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => [
      'item',
      'g:product_detail',
      'g:additional_image_link',
      'g:shipping',
    ].includes(name),
    cdataPropName: '__cdata',
  });

  const parsed = parser.parse(xml);
  const items = parsed.rss.channel.item;

  console.log(`Processing ${items.length} items...`);

  for (const item of items) {
    const details = item['g:product_detail'];

    const farba    = getDetail(details, 'Farba');
    const pohlavie = getDetail(details, 'Pohlavie');
    const material = getDetail(details, 'Materiál') || getDetail(details, 'Material');
    const vzor     = getDetail(details, 'Vzor');

    if (farba    && !item['g:color'])    item['g:color']    = farba.split(/,\s*/).slice(0, 3).join('/');
    if (pohlavie && !item['g:gender'])   item['g:gender']   = GENDER_MAP[pohlavie] || 'female';
    if (material && !item['g:material']) item['g:material'] = material.split(/,\s*/).slice(0, 3).join('/');
    if (vzor     && !item['g:pattern'])  item['g:pattern']  = vzor;

    if (!item['g:age_group'])  item['g:age_group']  = 'adult';
    if (!item['g:size_type'])  item['g:size_type']  = 'regular';
    if (!item['g:size_system']) item['g:size_system'] = 'EU';
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '__cdata',
    format: true,
    suppressEmptyNode: true,
  });

  const built = builder.build(parsed);
  // Odstráň prípadnú existujúcu XML deklaráciu a pridaj čistú na začiatok
  const stripped = built.replace(/<\?xml[^?]*\?>\s*/i, '');
  const outputXml = '<?xml version="1.0" encoding="UTF-8"?>\n' + stripped;

  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/feed.xml', outputXml, 'utf-8');
  console.log(`Done! Feed saved to docs/feed.xml`);
}

transformFeed().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
