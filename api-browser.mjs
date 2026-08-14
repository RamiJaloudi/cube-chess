import { CubeGameV2 } from './engine-v2.mjs';

const PATCHED=Symbol.for('cube-chess.api-browser');
const params=new URLSearchParams(location.search);
let connected=false,submitting=false,refreshing=false,internalControl=false,localAutomationPaused=false;
let activeGame=null,cachedState=null,legalMoves=[],socket=null,pollTimer=null,lastDrawPrompt='';
let apiBase=params.get('api_url')||'http://127.0.0.1:8000',apiKey='',matchId=params.get('match')||'',seatToken=params.get('seat')||'',seatArmyId=null;

const sessionKey='cube-chess-api-connection';
try{
  const saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null');
  if(saved){apiBase=saved.apiBase||apiBase;apiKey=saved.apiKey||'';matchId=saved.matchId||matchId;seatToken=saved.seatToken||seatToken}
}catch{}

function toast(message){
  const element=document.querySelector('#toast');if(!element)return;
  element.textContent=message;element.classList.add('show');setTimeout(()=>element.classList.remove('show'),3200);
}

function headers(){return{'Content-Type':'application/json','X-API-Key':apiKey,'X-Seat-Token':seatToken}}
async function request(path,options={}){
  const response=await fetch(`${apiBase.replace(/\/$/,'')}${path}`,{...options,headers:{...headers(),...(options.headers||{})}});
  const contentType=response.headers.get('content-type')||'';
  const body=contentType.includes('json')?await response.json().catch(()=>({detail:response.statusText})):await response.text();
  if(!response.ok)throw new Error(body?.detail||body?.error||`API request failed (${response.status})`);
  return body;
}

function hydrate(game,state){
  const currentId=state.currentArmy?.id||state.armies[state.turnIndex]?.id;
  game.config=structuredClone(state.config);
  game.armies=structuredClone(state.armies).map(army=>({...army,serverController:army.controller,controller:army.id===seatArmyId&&army.id===currentId?'human':'cpu'}));
  game.board=structuredClone(state.board);game.turnIndex=state.turnIndex;game.eliminated=new Set(state.eliminated);game.history=structuredClone(state.history);
  game.gameOver=state.gameOver;game.winner=state.winner;game.lastEvent=state.lastEvent;game.enPassant=structuredClone(state.enPassant);game.id=state.nextPieceId;
  game.halfmoveClock=state.halfmoveClock||0;game.positionCounts=structuredClone(state.positionCounts||{});game.drawReason=state.drawReason||null;
}

function pauseLocalAutomation(){
  if(!localAutomationPaused){
    const pause=document.querySelector('#playPause');
    if(pause?.textContent.trim()==='Pause CPUs'){
      internalControl=true;pause.click();internalControl=false;localAutomationPaused=true;
    }
  }
  const current=cachedState?.currentArmy?.id,button=current&&document.querySelector(`#seatList [data-army="${current}"]`);
  if(button){internalControl=true;button.click();button.click();internalControl=false}
}

function decorateOnlineUi(){
  document.documentElement.classList.toggle('api-connected',connected);
  const currentId=cachedState?.currentArmy?.id;
  document.querySelectorAll('#seatList [data-army]').forEach(button=>{
    const army=cachedState?.armies.find(candidate=>candidate.id===button.dataset.army);
    if(army)button.textContent=army.controller==='gpu'?'GPU':army.controller==='external'?'Agent':army.controller==='cpu'?'CPU':'Human';
    button.disabled=false;button.title=connected?'Click to switch this API seat between Human and CPU.':'';
  });
  document.querySelectorAll('#formatTabs button,#modeSize').forEach(control=>control.disabled=connected);
  const newGame=document.querySelector('#newGame');if(newGame)newGame.textContent=connected?'Refresh API match':'Start new match';
  const playPause=document.querySelector('#playPause');
  if(playPause&&connected)playPause.textContent=cachedState?.config?.automationPaused?'Resume CPUs':'Pause CPUs';
  const style=document.querySelector('#difficulty');
  if(style&&connected&&cachedState?.config?.cpuStyle)style.value=cachedState.config.cpuStyle;
  const pace=document.querySelector('#cpuPace'),paceValue=String(cachedState?.config?.agentPaceMs??'');
  if(pace&&connected&&[...pace.options].some(option=>option.value===paceValue))pace.value=paceValue;
  const status=document.querySelector('#apiConnectionStatus');
  if(status)status.textContent=connected?`CONNECTED · ${seatArmyId||'SPECTATOR'} · ${currentId||''}`:'Not connected';
}

function redraw(){
  if(!cachedState||!activeGame)return;
  refreshing=true;document.querySelector('#newGame')?.click();refreshing=false;
  pauseLocalAutomation();decorateOnlineUi();maybePromptForDraw();
}

function applyState(state,armyId=seatArmyId){
  cachedState=state;seatArmyId=armyId||seatArmyId;legalMoves=state.legalMoves||[];
  redraw();
}

async function fetchState(){
  if(!connected)return;
  const result=await request(`/api/v1/matches/${encodeURIComponent(matchId)}?include_legal_moves=true`);
  applyState(result.state);
}

function openSocket(){
  socket?.close();
  const url=new URL(apiBase);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname=`/ws/v1/matches/${encodeURIComponent(matchId)}`;
  url.searchParams.set('api_key',apiKey);if(seatToken)url.searchParams.set('seat_token',seatToken);
  socket=new WebSocket(url);
  socket.addEventListener('open',()=>toast('Agent API connected.'));
  socket.addEventListener('message',event=>{
    try{
      const message=JSON.parse(event.data);
      if(message.type==='snapshot')applyState(message.payload.state,message.payload.armyId);
      else if(message.type==='error')toast(message.detail||'Agent API error.');
      else if(message.type!=='pong')fetchState().catch(error=>toast(error.message));
    }catch(error){toast(error.message)}
  });
  socket.addEventListener('close',()=>{if(connected)toast('Real-time connection lost; polling remains active.')});
}

async function connect(){
  apiBase=document.querySelector('#apiBase')?.value.trim()||apiBase;apiKey=document.querySelector('#apiKey')?.value.trim()||'';matchId=document.querySelector('#apiMatch')?.value.trim()||'';seatToken=document.querySelector('#apiSeatToken')?.value.trim()||'';
  if(!apiBase||!apiKey||!matchId)throw new Error('API URL, API key, and match ID are required.');
  connected=true;
  try{
    sessionStorage.setItem(sessionKey,JSON.stringify({apiBase,apiKey,matchId,seatToken}));
    await fetchState();openSocket();clearInterval(pollTimer);pollTimer=setInterval(()=>fetchState().catch(()=>{}),3000);decorateOnlineUi();
  }catch(error){connected=false;decorateOnlineUi();throw error}
}

function disconnect(){
  connected=false;socket?.close();socket=null;clearInterval(pollTimer);pollTimer=null;sessionStorage.removeItem(sessionKey);cachedState=null;legalMoves=[];seatArmyId=null;
  location.reload();
}

function sameSquare(first,second){return first.face===second.face&&first.row===second.row&&first.col===second.col}
function promotionChoice(candidates){
  if(candidates.length<=1)return candidates[0];
  const answer=String(prompt('Promote pawn to:\nQueen (Q)\nRook (R)\nBishop (B)\nKnight (N)','Queen')||'queen').trim().toLowerCase();
  const names={q:'queen',r:'rook',b:'bishop',n:'knight'},choice=names[answer]||answer;
  return candidates.find(candidate=>candidate.to.promoteTo===choice)||candidates.find(candidate=>candidate.to.promoteTo==='queen');
}

async function submitLocalMove(move){
  if(submitting)return;
  if(cachedState?.currentArmy?.id!==seatArmyId){toast('Waiting for your Agent API seat.');return}
  const candidates=legalMoves.filter(candidate=>sameSquare(candidate.from,move.from)&&sameSquare(candidate.to,move.to));
  const selected=promotionChoice(candidates);
  if(!selected){toast('The Agent API rejected this local move candidate.');return}
  submitting=true;
  try{
    const result=await request(`/api/v1/matches/${encodeURIComponent(matchId)}/moves`,{method:'POST',body:JSON.stringify({move_id:selected.move_id,state_version:cachedState.stateVersion})});
    applyState(result.state);
  }catch(error){toast(error.message);await fetchState().catch(()=>{})}finally{submitting=false}
}

async function apiAction(path,body){
  const result=await request(`/api/v1/matches/${encodeURIComponent(matchId)}/${path}`,{method:'POST',body:JSON.stringify(body||{})});
  if(result.state)applyState(result.state);else await fetchState();
  return result;
}

async function automationAction(action,extra={}){return apiAction('automation',{action,...extra})}
async function controllerAction(armyId,controller){return apiAction(`seats/${encodeURIComponent(armyId)}/controller`,{controller})}

async function setControllers(selector){
  const changes=cachedState.armies.map((army,index)=>({army,controller:selector(army,index)})).filter(item=>item.army.controller!==item.controller);
  await Promise.all(changes.map(item=>request(`/api/v1/matches/${encodeURIComponent(matchId)}/seats/${encodeURIComponent(item.army.id)}/controller`,{method:'POST',body:JSON.stringify({controller:item.controller})})));
  await fetchState();
}

function maybePromptForDraw(){
  const offer=cachedState?.drawOffer,army=cachedState?.armies.find(candidate=>candidate.id===seatArmyId);
  if(!offer||!army||!offer.requiredTeams.includes(army.team)||offer.acceptedTeams.includes(army.team))return;
  const signature=`${offer.offeredBy}:${cachedState.stateVersion}:${army.team}`;if(signature===lastDrawPrompt)return;lastDrawPrompt=signature;
  const accept=confirm(`${offer.offeringTeam} offered a draw. Accept?`);
  apiAction('draw-response',{accept}).catch(error=>toast(error.message));
}

function installEngineBridge(){
  const proto=CubeGameV2.prototype;if(proto[PATCHED])return;proto[PATCHED]=true;
  const originalReset=proto.reset,originalPlay=proto.play;
  proto.reset=function(...args){const result=originalReset.apply(this,args);activeGame=this;if(connected&&cachedState)hydrate(this,cachedState);return result};
  proto.play=function(move){if(!connected)return originalPlay.call(this,move);submitLocalMove(structuredClone(move));return{state:{type:'pending',message:'Move submitted to Agent API.'}}};
}

function installPanel(){
  const setup=document.querySelector('#setupPanel'),newGame=document.querySelector('#newGame');if(!setup||!newGame)return;
  const panel=document.createElement('section');panel.className='api-connect-card';panel.innerHTML=`<div class="eyebrow">AGENT API</div><label>API URL<input id="apiBase" value="${apiBase}" autocomplete="url"></label><label>API key<input id="apiKey" type="password" value="${apiKey}" autocomplete="off"></label><label>Match ID<input id="apiMatch" value="${matchId}" autocomplete="off"></label><label>Seat token<input id="apiSeatToken" type="password" value="${seatToken}" autocomplete="off"></label><div class="quick-row"><button id="apiConnect" class="secondary">Connect</button><button id="apiDisconnect" class="secondary">Disconnect</button></div><small id="apiConnectionStatus">Not connected</small>`;
  setup.insertBefore(panel,newGame);
  panel.querySelector('#apiConnect').addEventListener('click',()=>connect().catch(error=>toast(error.message)));
  panel.querySelector('#apiDisconnect').addEventListener('click',disconnect);
  newGame.addEventListener('click',event=>{if(connected&&!refreshing){event.preventDefault();event.stopImmediatePropagation();fetchState().catch(error=>toast(error.message))}},true);
  document.querySelector('#offerDraw')?.addEventListener('click',event=>{if(!connected)return;event.preventDefault();event.stopImmediatePropagation();apiAction('draw-offer').catch(error=>toast(error.message))},true);
  document.querySelector('#resignArmy')?.addEventListener('click',event=>{if(!connected)return;event.preventDefault();event.stopImmediatePropagation();if(confirm('Resign this Agent API seat?'))apiAction('resign').catch(error=>toast(error.message))},true);
  document.querySelector('#playPause')?.addEventListener('click',event=>{
    if(!connected||internalControl)return;event.preventDefault();event.stopImmediatePropagation();
    automationAction(cachedState?.config?.automationPaused?'resume':'pause').catch(error=>toast(error.message));
  },true);
  document.querySelector('#stepCpu')?.addEventListener('click',event=>{
    if(!connected||internalControl)return;event.preventDefault();event.stopImmediatePropagation();automationAction('step').catch(error=>toast(error.message));
  },true);
  document.querySelector('#cpuPace')?.addEventListener('change',event=>{
    if(!connected||internalControl)return;event.stopImmediatePropagation();automationAction('set-pace',{pace_ms:Number(event.target.value)}).catch(error=>toast(error.message));
  },true);
  document.querySelector('#difficulty')?.addEventListener('change',event=>{
    if(!connected||internalControl)return;event.stopImmediatePropagation();automationAction('set-style',{cpu_style:event.target.value}).catch(error=>toast(error.message));
  },true);
  document.querySelector('#seatList')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-army]');if(!connected||internalControl||!button)return;
    event.preventDefault();event.stopImmediatePropagation();const army=cachedState?.armies.find(candidate=>candidate.id===button.dataset.army);
    if(army)controllerAction(army.id,army.controller==='cpu'?'human':'cpu').catch(error=>toast(error.message));
  },true);
  document.querySelector('#allCpu')?.addEventListener('click',event=>{
    if(!connected||internalControl)return;event.preventDefault();event.stopImmediatePropagation();setControllers(()=> 'cpu').then(()=>automationAction('resume')).catch(error=>toast(error.message));
  },true);
  document.querySelector('#humanSide')?.addEventListener('click',event=>{
    if(!connected||internalControl)return;event.preventDefault();event.stopImmediatePropagation();
    const kind=cachedState?.config?.kind;
    setControllers((army,index)=>kind==='coalition'?(army.team==='Solo'?'human':'cpu'):kind==='teams'?(army.team==='Axis A'?'human':'cpu'):(index===0?'human':'cpu')).catch(error=>toast(error.message));
  },true);
  const style=document.createElement('style');style.textContent='.api-connect-card{margin:10px 0;padding:10px;border:1px solid rgba(139,124,255,.28);border-radius:10px;background:rgba(5,7,12,.32)}.api-connect-card label{display:grid;grid-template-columns:86px 1fr;align-items:center;gap:8px;margin:6px 0;color:#aeb1c4;font-size:11px}.api-connect-card input{min-width:0;background:#0b0d15;color:#f4f1e8;border:1px solid rgba(255,255,255,.16);border-radius:6px;padding:7px}.api-connect-card small{display:block;margin-top:7px;color:#72dfb2}';document.head.appendChild(style);
}

installEngineBridge();installPanel();
setTimeout(()=>{if(matchId&&apiKey)connect().catch(error=>toast(error.message))},0);
