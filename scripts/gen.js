const fs = require('fs');

let content = '';
for (let i = 2300; i <= 2637; i++) {
    content += `#EXTINF:-1 tvg-name="Desi Tales ${i}" tvg-logo="https://cdn.desitales2.com/2000/${i}/${i}.jpg" group-title="Desi Tales",Desi Tales ${i}\r\n`;
    content += `https://cdn.desitales2.com/2000/${i}/${i}.mp4\r\n`;
}

fs.writeFileSync('d:/Worker/public/m3u/desitales.txt', content);
console.log('Created desitales.txt with ' + (2637 - 2300 + 1) + ' entries');
