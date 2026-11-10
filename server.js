const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 10000;
const OWNER = process.env.GITHUB_OWNER || 'qtx1356-lang';
const REPO = process.env.GITHUB_REPO || 'blink-digital-blog';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const APP_ID = process.env.GITHUB_APP_ID || '';
const INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID || '';
const CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET || '';
const PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const BOOTSTRAP_ADMIN = (process.env.ADMIN_ALLOWED_USER || OWNER).toLowerCase();
const ARTICLES_PATH = 'assets/articles.json';
const USERS_PATH = 'assets/admin-users.json';
const sessions = new Map();
const pendingStates = new Map();
let installationToken = '';
let installationTokenExpiry = 0;
const SESSION_TTL = 8 * 60 * 60 * 1000;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',...headers});
  res.end(JSON.stringify(body));
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
}
function cookie(name,value,maxAge) { return name+'='+encodeURIComponent(value)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge; }
function clearCookie(name) { return name+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'; }
function sessionFor(req) {
  const id=cookies(req).blink_session, s=id&&sessions.get(id);
  if(!s||s.expiresAt<Date.now()){if(id)sessions.delete(id);return null;}
  s.expiresAt=Date.now()+SESSION_TTL; return s;
}
function readBody(req,limit=2*1024*1024) {
  return new Promise((resolve,reject)=>{let body='';req.on('data',c=>{body+=c;if(body.length>limit){reject(new Error('Request is too large.'));req.destroy();}});req.on('end',()=>{try{resolve(body?JSON.parse(body):{});}catch{reject(new Error('Invalid JSON body.'));}});req.on('error',reject);});
}
function b64url(value){return Buffer.from(value).toString('base64url');}
function appJwt() {
  if(!APP_ID||!PRIVATE_KEY||!INSTALLATION_ID) throw new Error('GitHub App server credentials are not configured.');
  const now=Math.floor(Date.now()/1000), head=b64url(JSON.stringify({alg:'RS256',typ:'JWT'})), body=b64url(JSON.stringify({iat:now-60,exp:now+540,iss:APP_ID}));
  const unsigned=head+'.'+body;
  const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),PRIVATE_KEY).toString('base64url');
  return unsigned+'.'+signature;
}
async function github(pathname,token,options={}) {
  const response=await fetch('https://api.github.com'+pathname,{...options,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Blink-Digital-Blog-Admin',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(data.message||'GitHub API returned '+response.status);e.status=response.status;throw e;}
  return data;
}
async function getInstallationToken() {
  if(installationToken&&installationTokenExpiry>Date.now()+60000)return installationToken;
  const jwt=appJwt();
  const data=await github('/app/installations/'+encodeURIComponent(INSTALLATION_ID)+'/access_tokens',jwt,{method:'POST'});
  installationToken=data.token;installationTokenExpiry=new Date(data.expires_at).getTime();return installationToken;
}
async function gh(pathname,options={}) { return github(pathname,await getInstallationToken(),options); }
async function readRepoJson(filePath,fallback) {
  try {
    const file=await gh('/repos/'+OWNER+'/'+REPO+'/contents/'+filePath.split('/').map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(BRANCH));
    return {value:JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8')),sha:file.sha};
  } catch(e) {
    if(e.status===404)return {value:fallback,sha:null};
    throw e;
  }
}
async function writeRepoJson(filePath,value,sha,message) {
  const body={message,content:Buffer.from(JSON.stringify(value,null,2),'utf8').toString('base64'),branch:BRANCH};
  if(sha)body.sha=sha;
  return gh('/repos/'+OWNER+'/'+REPO+'/contents/'+filePath,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
}
async function usersStore() {
  const store=await readRepoJson(USERS_PATH,{users:[],invites:[]});
  if(!Array.isArray(store.value.users))store.value.users=[];
  if(!Array.isArray(store.value.invites))store.value.invites=[];
  let changed=false;
  if(!store.value.users.some(u=>u.login.toLowerCase()===BOOTSTRAP_ADMIN)){
    store.value.users.push({login:BOOTSTRAP_ADMIN,name:BOOTSTRAP_ADMIN,role:'admin',status:'active',createdAt:new Date().toISOString()});changed=true;
  }
  if(changed){await writeRepoJson(USERS_PATH,store.value,store.sha,'Initialize Blink dashboard users');return usersStore();}
  return store;
}
async function getArticles(){const result=await readRepoJson(ARTICLES_PATH,[]);return {articles:Array.isArray(result.value)?result.value:[],sha:result.sha};}
function validArticle(a){return a&&typeof a==='object'&&typeof a.id==='string'&&typeof a.title==='string'&&a.title.trim()&&typeof a.category==='string'&&typeof a.excerpt==='string'&&Array.isArray(a.content)&&a.content.every(p=>typeof p==='string');}
function safeUser(u){return {login:u.login,name:u.name||u.login,role:u.role,status:u.status,createdAt:u.createdAt};}
function isAdmin(s){return s.user.role==='admin';}
function sameOrigin(req){const origin=req.headers.origin;return !origin||!PUBLIC_BASE_URL||origin===PUBLIC_BASE_URL;}
async function route(req,res) {
  const url=new URL(req.url,'http://'+(req.headers.host||'localhost'));
  if(req.method==='GET'&&url.pathname==='/healthz')return send(res,200,{ok:true});
  if(req.method==='GET'&&url.pathname==='/auth/github'){
    if(!CLIENT_ID||!CLIENT_SECRET||!PUBLIC_BASE_URL)return send(res,503,{error:'GitHub OAuth is not configured. Add the GitHub App client ID and secret in Render.'});
    const state=crypto.randomBytes(24).toString('hex');pendingStates.set(state,Date.now()+600000);
    const auth=new URL('https://github.com/login/oauth/authorize');auth.searchParams.set('client_id',CLIENT_ID);auth.searchParams.set('redirect_uri',PUBLIC_BASE_URL+'/auth/callback');auth.searchParams.set('state',state);auth.searchParams.set('allow_signup','true');
    res.writeHead(302,{Location:auth.toString(),'Cache-Control':'no-store','Set-Cookie':cookie('blink_oauth_state',state,600)});return res.end();
  }
  if(req.method==='GET'&&url.pathname==='/auth/callback'){
    const state=url.searchParams.get('state')||'', sc=cookies(req).blink_oauth_state||'', expiry=pendingStates.get(state);pendingStates.delete(state);
    if(!state||state!==sc||!expiry||expiry<Date.now())return send(res,400,{error:'Sign-in verification failed. Please start again.'},{'Set-Cookie':clearCookie('blink_oauth_state')});
    if(url.searchParams.has('error')){res.writeHead(302,{Location:'/?login=cancelled','Set-Cookie':clearCookie('blink_oauth_state')});return res.end();}
    try{
      const tokenRes=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,code:url.searchParams.get('code')||'',redirect_uri:PUBLIC_BASE_URL+'/auth/callback',state})});
      const tokenData=await tokenRes.json();if(!tokenRes.ok||tokenData.error||!tokenData.access_token)throw new Error(tokenData.error_description||'GitHub sign-in failed.');
      const identity=await github('/user',tokenData.access_token);
      const login=(identity.login||'').toLowerCase();if(!login)throw new Error('GitHub did not return a username.');
      const store=await usersStore();let user=store.value.users.find(u=>u.login.toLowerCase()===login);
      if(user&&user.status==='disabled')return send(res,403,{error:'This account has been disabled. Contact the Blink administrator.'},{'Set-Cookie':clearCookie('blink_oauth_state')});
      if(!user){
        const inviteIndex=store.value.invites.findIndex(v=>v.login.toLowerCase()===login);
        if(inviteIndex>=0){store.value.invites.splice(inviteIndex,1);user={login,name:identity.name||login,role:'author',status:'active',createdAt:new Date().toISOString()};store.value.users.push(user);await writeRepoJson(USERS_PATH,store.value,store.sha,'Accept Blink author invitation');}
        else {
          user={login,name:identity.name||login,role:'author',status:'pending',createdAt:new Date().toISOString()};
          if(process.env.ALLOW_PUBLIC_REGISTRATION!=='true')return send(res,403,{error:'Registration is currently closed. Ask the Blink administrator for an invitation.'},{'Set-Cookie':clearCookie('blink_oauth_state')});
          store.value.users.push(user);await writeRepoJson(USERS_PATH,store.value,store.sha,'Register Blink author account');
          res.writeHead(302,{Location:'/?login=pending','Set-Cookie':clearCookie('blink_oauth_state'),'Cache-Control':'no-store'});return res.end();
        }
      }
      if(user.status!=='active'){res.writeHead(302,{Location:'/?login=pending','Set-Cookie':clearCookie('blink_oauth_state'),'Cache-Control':'no-store'});return res.end();}
      const sessionId=crypto.randomBytes(32).toString('hex');sessions.set(sessionId,{user:safeUser(user),expiresAt:Date.now()+SESSION_TTL});
      res.writeHead(302,{Location:'/?login=success','Cache-Control':'no-store','Set-Cookie':[clearCookie('blink_oauth_state'),cookie('blink_session',sessionId,SESSION_TTL/1000)]});return res.end();
    }catch(e){console.error(e);return send(res,403,{error:'Sign-in could not be completed: '+e.message},{'Set-Cookie':clearCookie('blink_oauth_state')});}
  }
  if(req.method==='GET'&&url.pathname==='/api/session'){
    const s=sessionFor(req);return send(res,200,s?{authenticated:true,user:s.user}:{authenticated:false});
  }
  if(req.method==='POST'&&url.pathname==='/auth/logout'){const id=cookies(req).blink_session;if(id)sessions.delete(id);return send(res,200,{ok:true},{'Set-Cookie':clearCookie('blink_session')});}
  const session=sessionFor(req);
  if(url.pathname.startsWith('/api/')&&!session)return send(res,401,{error:'Please sign in again.'});
  if(url.pathname.startsWith('/api/')&&!sameOrigin(req))return send(res,403,{error:'Request origin not allowed.'});
  if(req.method==='GET'&&url.pathname==='/api/users'){
    if(!isAdmin(session))return send(res,403,{error:'Only admins can manage users.'});
    const store=await usersStore();return send(res,200,{users:store.value.users.map(safeUser),invites:store.value.invites});
  }
  if(req.method==='POST'&&url.pathname==='/api/users/invite'){
    if(!isAdmin(session))return send(res,403,{error:'Only admins can invite authors.'});
    const body=await readBody(req),login=String(body.login||'').trim().replace(/^@/,'').toLowerCase();
    if(!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(login))return send(res,400,{error:'Enter a valid GitHub username.'});
    const store=await usersStore();
    if(store.value.users.some(u=>u.login.toLowerCase()===login&&u.status!=='disabled'))return send(res,409,{error:'This user already has an account.'});
    if(!store.value.invites.some(v=>v.login.toLowerCase()===login))store.value.invites.push({login,invitedBy:session.user.login,createdAt:new Date().toISOString()});
    await writeRepoJson(USERS_PATH,store.value,store.sha,'Invite Blink author '+login);return send(res,200,{ok:true});
  }
  if(req.method==='PATCH'&&url.pathname.startsWith('/api/users/')){
    if(!isAdmin(session))return send(res,403,{error:'Only admins can update users.'});
    const login=decodeURIComponent(url.pathname.slice('/api/users/'.length)).toLowerCase(),body=await readBody(req),store=await usersStore();
    const target=store.value.users.find(u=>u.login.toLowerCase()===login);if(!target)return send(res,404,{error:'User not found.'});
    if(target.login.toLowerCase()===BOOTSTRAP_ADMIN&&body.status==='disabled')return send(res,400,{error:'The primary administrator cannot be disabled.'});
    if(body.status&&['active','disabled'].includes(body.status))target.status=body.status;
    if(body.role&&['admin','author'].includes(body.role)&&target.login.toLowerCase()!==BOOTSTRAP_ADMIN)target.role=body.role;
    await writeRepoJson(USERS_PATH,store.value,store.sha,'Update Blink user '+login);return send(res,200,{ok:true});
  }
  if(url.pathname==='/api/articles'&&(req.method==='GET'||req.method==='PUT')){
    if(req.method==='GET'){const data=await getArticles();const visible=isAdmin(session)?data.articles:data.articles.filter(a=>a.authorId===session.user.login);return send(res,200,{articles:visible});}
    const body=await readBody(req);if(!Array.isArray(body.articles)||body.articles.length>500||!body.articles.every(validArticle))return send(res,400,{error:'Article data is incomplete or invalid.'});
    const current=await getArticles(),old=current.articles;
    if(isAdmin(session)){
      const oldMap=new Map(old.map(a=>[a.id,a]));const next=body.articles.map(a=>({...a,authorId:a.authorId||(oldMap.get(a.id)||{}).authorId||session.user.login,authorName:a.authorName||(oldMap.get(a.id)||{}).authorName||session.user.name}));
      await writeRepoJson(ARTICLES_PATH,next,current.sha,'Manage Blink blog articles');return send(res,200,{ok:true});
    }
    const ownedOld=old.filter(a=>a.authorId===session.user.login),incoming=body.articles;
    if(incoming.length>ownedOld.length+1)return send(res,403,{error:'Authors can only create or manage their own articles.'});
    const incomingIds=new Set(incoming.map(a=>a.id));
    if(ownedOld.some(a=>!incomingIds.has(a.id)))return send(res,403,{error:'Authors cannot delete articles belonging to another account.'});
    const ownedIds=new Set(ownedOld.map(a=>a.id));
    if(incoming.some(a=>old.some(o=>o.id===a.id&&!ownedIds.has(a.id))))return send(res,403,{error:'Authors cannot edit another author’s article.'});
    const merged=old.filter(a=>a.authorId!==session.user.login);
    for(const a of incoming)merged.unshift({...a,authorId:session.user.login,authorName:session.user.name});
    await writeRepoJson(ARTICLES_PATH,merged,current.sha,'Publish Blink author articles');return send(res,200,{ok:true});
  }
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/admin.html')){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});return fs.createReadStream(path.join(__dirname,'admin.html')).pipe(res);
  }
  return send(res,404,{error:'Not found.'});
}
http.createServer((req,res)=>{route(req,res).catch(e=>{console.error(e);if(!res.headersSent)send(res,e.status||500,{error:e.message||'Unexpected server error.'});else res.end();});}).listen(PORT,()=>console.log('Blink multi-user admin listening on '+PORT));