const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'app.js', 'favicon.svg']) {
  fs.copyFileSync(path.join(__dirname, name), path.join(output, name));
}
console.log('Static website built in dist/');
