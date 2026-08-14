import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root=resolve(process.cwd());
const port=Number(process.env.CUBE_CHESS_PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};

createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
  const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/,''),file=resolve(root,relative);
  if(file!==root&&!file.startsWith(root+sep)){response.writeHead(403);response.end('Forbidden');return}
  if(!existsSync(file)||!statSync(file).isFile()){response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});response.end('Not found');return}
  response.writeHead(200,{'Content-Type':types[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  createReadStream(file).pipe(response);
}).listen(port,'127.0.0.1',()=>console.log(`Cube Chess running at http://127.0.0.1:${port}/`));
