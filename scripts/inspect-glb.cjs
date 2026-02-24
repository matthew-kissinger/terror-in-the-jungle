const fs = require('fs');
const paths = process.argv.slice(2);
for (const path of paths) {
  const buf = fs.readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  console.log(`\n=== ${path} ===`);
  console.log('Nodes:');
  json.nodes.forEach((n, i) => {
    let info = '  ' + i + ': ' + (n.name || '(unnamed)');
    if (n.children) info += ' children:' + JSON.stringify(n.children);
    if (n.mesh !== undefined) info += ' mesh:' + n.mesh;
    console.log(info);
  });
}
