const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const base=__dirname;
http.createServer((req,res)=>{
 let url;try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
 const relative='.'+(url==='/'?'/index.html':url),file=path.resolve(base,relative);
 if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return}
 const fallback=path.resolve(base,'dist',relative);
 fs.readFile(fs.existsSync(file)?file:fallback,(err,data)=>{if(err){res.writeHead(404).end('Not found');return}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(data)});
}).listen(5173,'127.0.0.1',()=>console.log('http://localhost:5173'));
