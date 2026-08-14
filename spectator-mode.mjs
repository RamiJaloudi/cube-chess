const allCpuButton=document.querySelector('#allCpu');
const humanSideButton=document.querySelector('#humanSide');
const seatList=document.querySelector('#seatList');
let spectatorEnabled=false;
let applying=false;

function reflect(){
  allCpuButton?.classList.toggle('spectator-active',spectatorEnabled);
  allCpuButton?.setAttribute('aria-pressed',String(spectatorEnabled));
}

allCpuButton?.addEventListener('click',()=>{
  spectatorEnabled=true;
  queueMicrotask(reflect);
},true);

humanSideButton?.addEventListener('click',()=>{
  spectatorEnabled=false;
  queueMicrotask(reflect);
},true);

seatList?.addEventListener('click',event=>{
  if(!event.target.closest('[data-army]'))return;
  spectatorEnabled=false;
  queueMicrotask(reflect);
},true);

function preserveSpectatorMode(){
  if(!spectatorEnabled||applying)return;
  const hasHuman=[...seatList.querySelectorAll('[data-army]')].some(button=>button.textContent.trim().toLowerCase()==='human');
  if(!hasHuman)return;
  applying=true;
  allCpuButton.click();
  queueMicrotask(()=>{applying=false;reflect()});
}

if(seatList)new MutationObserver(preserveSpectatorMode).observe(seatList,{childList:true,subtree:true});
reflect();
