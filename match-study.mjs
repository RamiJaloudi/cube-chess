import { CubeGameV2 } from './engine-v2.mjs';
import { gameToCsv, csvFilename } from './match-csv.mjs';
import { installStudyHooks } from './study-engine.mjs';

const state={paused:false,stepAllowance:false,current:null};
const leftPanel=document.querySelector('.v2-left');
const armyList=document.querySelector('#armyList');
const divider=leftPanel?.querySelector('.divider');
const setupPause=document.querySelector('#playPause');
const setupStep=document.querySelector('#stepCpu');
const setupPace=document.querySelector('#cpuPace');

const paceOptions=[
  ['6000','Study · 6 sec'],
  ['3000','Cinematic · 3 sec'],
  ['1400','Measured · 1.4 sec'],
  ['650','Quick · 0.65 sec'],
  ['160','Blitz · 0.16 sec']
];

if(setupPace){
  const selected=setupPace.value;
  setupPace.innerHTML=paceOptions.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  setupPace.value=paceOptions.some(([value])=>value===selected)?selected:'1400';
}

const dock=document.createElement('section');
dock.id='studyDock';
dock.className='study-dock';
dock.innerHTML=`
  <div class="study-heading"><span>SPECTATOR CONTROLS</span><b id="studyStatus">READY</b></div>
  <div class="study-actions"><button id="studyPause" class="secondary">Pause match</button><button id="studyStep" class="secondary">Step one move</button></div>
  <label class="study-speed"><span>CPU viewing speed</span><select id="studyPace">${paceOptions.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
  <div id="exportWrap" class="study-export" hidden><span>Match complete · full move record ready</span><button id="exportCsv">Export all moves · CSV</button></div>`;
if(leftPanel)leftPanel.insertBefore(dock,divider||null);

const studyPause=dock.querySelector('#studyPause');
const studyStep=dock.querySelector('#studyStep');
const studyPace=dock.querySelector('#studyPace');
const studyStatus=dock.querySelector('#studyStatus');
const exportWrap=dock.querySelector('#exportWrap');
const exportButton=dock.querySelector('#exportCsv');
studyPace.value=setupPace?.value||'650';

let refreshQueued=false;
function renderStudyControls(){
  refreshQueued=false;
  const game=state.current;
  const cpuCount=game?.armies.filter(army=>army.controller==='cpu'&&!game.eliminated.has(army.id)).length||0;
  const finished=!!game?.gameOver;
  studyPause.textContent=state.paused?'Resume match':'Pause match';
  studyPause.disabled=finished;
  studyStep.disabled=finished||game?.currentArmy()?.controller!=='cpu';
  studyStatus.textContent=finished?'FINAL':state.paused?'PAUSED':cpuCount?`${cpuCount} CPU · LIVE`:'HUMAN MATCH';
  studyStatus.classList.toggle('paused',state.paused);
  studyPace.value=setupPace?.value||studyPace.value;
  exportWrap.hidden=!finished;
  if(finished)exportButton.textContent=`Export ${game.history.length} moves · CSV`;
}

function queueRefresh(){
  if(refreshQueued)return;
  refreshQueued=true;
  queueMicrotask(renderStudyControls);
}

installStudyHooks(CubeGameV2,state,queueRefresh);

function setPausedFromSetup(){
  state.paused=!setupPause.textContent.toLowerCase().includes('resume');
  queueRefresh();
}

setupPause?.addEventListener('click',setPausedFromSetup,true);
setupStep?.addEventListener('click',()=>{state.stepAllowance=true},true);

studyPause.addEventListener('click',()=>setupPause?.click());
studyStep.addEventListener('click',()=>{
  state.stepAllowance=true;
  setupStep?.click();
});

function applyPace(value){
  if(!setupPace)return;
  setupPace.value=value;
  studyPace.value=value;
  if(!state.paused&&setupPause){
    setupPause.click();
    setupPause.click();
  }
  queueRefresh();
}

studyPace.addEventListener('change',()=>applyPace(studyPace.value));
setupPace?.addEventListener('change',event=>{
  event.stopImmediatePropagation();
  applyPace(setupPace.value);
},true);

exportButton.addEventListener('click',()=>{
  const game=state.current;
  if(!game?.gameOver)return;
  const blob=new Blob([gameToCsv(game)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=csvFilename(game);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
});

if(armyList)new MutationObserver(queueRefresh).observe(armyList,{childList:true,subtree:true});
queueRefresh();
