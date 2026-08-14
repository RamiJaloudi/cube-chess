const turnHero=document.querySelector('#turnHero');
const armyList=document.querySelector('#armyList');
const moveCount=document.querySelector('#moveCount');
const toast=document.querySelector('#toast');

const turnSignal=document.createElement('div');
turnSignal.id='turnSignal';
turnSignal.setAttribute('role','status');
turnSignal.setAttribute('aria-live','assertive');
turnSignal.setAttribute('aria-atomic','true');
turnSignal.setAttribute('aria-label','Turn notification');
(toast?.parentNode||document.body).insertBefore(turnSignal,toast||null);

let lastHumanTurnKey=null;
let hideTimer=null;
let queued=false;

function directText(element){
  if(!element)return'';
  const copy=element.cloneNode(true);
  copy.querySelectorAll('small').forEach(node=>node.remove());
  return copy.textContent.trim();
}

function renderTurnState(){
  queued=false;
  const active=armyList?.querySelector('.army-row.active');
  const humanTurn=active?.querySelector('.seat-type')?.textContent.trim().toLowerCase()==='human';
  turnHero?.classList.toggle('is-human-turn',humanTurn);

  const turnCopy=turnHero?.querySelector('.turn-copy');
  if(humanTurn&&turnCopy&&!turnCopy.querySelector('.turn-pill')){
    const pill=document.createElement('em');
    pill.className='turn-pill';
    pill.textContent='YOUR TURN';
    turnCopy.appendChild(pill);
  }

  if(!humanTurn){
    lastHumanTurnKey=null;
    turnSignal.classList.remove('show');
    clearTimeout(hideTimer);
    return;
  }

  const face=active.querySelector('.face-code')?.textContent.trim()||'ARMY';
  const commander=directText(active.querySelector('.commander'))||'Human Commander';
  const color=active.querySelector('.player-swatch')?.style.backgroundColor||'#5ee79c';
  const key=`${moveCount?.textContent||''}:${face}:${commander}`;
  if(key===lastHumanTurnKey)return;
  lastHumanTurnKey=key;

  turnSignal.style.setProperty('--turn-color',color);
  turnSignal.innerHTML=`<div class="turn-signal-mark" aria-hidden="true"></div><div class="turn-signal-copy"><strong>YOUR TURN</strong><span>${commander} &middot; ${face}</span></div>`;
  turnSignal.classList.remove('show');
  void turnSignal.offsetWidth;
  turnSignal.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer=setTimeout(()=>turnSignal.classList.remove('show'),2200);
}

function queueRender(){
  if(queued)return;
  queued=true;
  queueMicrotask(renderTurnState);
}

const observer=new MutationObserver(queueRender);
for(const node of[turnHero,armyList,moveCount])if(node)observer.observe(node,{childList:true,subtree:true,characterData:true});
queueRender();
