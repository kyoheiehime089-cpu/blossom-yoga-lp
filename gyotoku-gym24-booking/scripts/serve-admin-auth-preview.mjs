import { createServer } from "node:http";
import { readFileSync, realpathSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),".."));
const allowed=new Set();
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon",".woff":"font/woff",".woff2":"font/woff2",".webmanifest":"application/manifest+json"};
function localAsset(ref,from){
  if(!ref.startsWith("."))return null;
  const candidate=resolve(dirname(from),ref.split(/[?#]/)[0]);
  try{
    const actual=realpathSync(candidate),name=relative(root,actual);
    if(name.startsWith("..")||name.split(/[\\/]/).some(s=>s.startsWith("."))||!types[extname(actual)]||!statSync(actual).isFile())return null;
    return actual;
  }catch{return null;}
}
function collect(file){
  if(allowed.has(file))return;
  allowed.add(file);
  if(![".html",".js",".mjs",".css"].includes(extname(file)))return;
  const source=readFileSync(file,"utf8"),refs=[];
  if(extname(file)===".html")for(const m of source.matchAll(/(?:src|href)=["']([^"']+)["']/g))refs.push(m[1]);
  if([".html",".js",".mjs"].includes(extname(file))){
    for(const m of source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g))refs.push(m[1]);
    for(const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g))refs.push(m[1]);
  }
  if(extname(file)===".css")for(const m of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g))refs.push(m[1]);
  for(const ref of refs){const asset=localAsset(ref,file);if(asset)collect(asset);}
}
collect(resolve(root,"admin.html"));
const server=createServer((req,res)=>{
  res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
  if(!["GET","HEAD"].includes(req.method)){res.writeHead(405);res.end();return;}
  if(new URL(req.url,"http://127.0.0.1").pathname==="/admin-auth-check.html"){
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
    res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>管理権限の確認</title><link rel="stylesheet" href="./admin-style.css"><main class="wrap"><section class="panel" id="loginView"><h1>管理権限の確認</h1><form id="authCheck"><label>メールアドレス<input id="adminEmail" type="email" required autocomplete="username"></label><label>パスワード<input id="adminAccountPassword" type="password" required autocomplete="current-password"></label><div id="adminMfaFields" hidden><label>認証コード<input id="adminMfaCode" inputmode="numeric"></label></div><button class="btn" type="submit">管理権限を確認する</button></form><p id="authResult" role="status"></p><button class="ghost" id="adminSignOut">ログアウト</button></section></main><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="./supabase-config.js"></script><script type="module">import './admin-auth-ui.mjs';document.querySelector('#authCheck').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;const s=document.querySelector('#authResult');try{await window.gym24AdminSignIn();s.textContent='管理権限を確認できました（本番データは変更していません）。';}catch(error){s.textContent=error.message;}finally{b.disabled=false;}});</script></html>`);
    return;
  }
  let file;
  try{const path=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);file=localAsset("."+path,resolve(root,"entry.html"));}catch{}
  if(!file||!allowed.has(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{"Content-Type":types[extname(file)]});res.end(req.method==="HEAD"?undefined:readFileSync(file));
});
server.listen(0,"127.0.0.1",()=>{
  const output=resolve(root,"tests/results/2026-10-16");mkdirSync(output,{recursive:true});
  writeFileSync(resolve(output,"admin-auth-preview-server.json"),JSON.stringify({pid:process.pid,host:"127.0.0.1",port:server.address().port,url:`http://127.0.0.1:${server.address().port}/admin.html`,root,allowedAssetCount:allowed.size,startedAt:new Date().toISOString()},null,2));
});
process.on("SIGTERM",()=>server.close(()=>process.exit(0)));
