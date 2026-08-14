const playPause=document.querySelector('#playPause');
const newGame=document.querySelector('#newGame');
const modeSize=document.querySelector('#modeSize');
const formatTabs=document.querySelector('#formatTabs');
const toast=document.querySelector('#toast');

function ensureFreshMatchIsRunning(){
  if(playPause?.textContent.trim().toLowerCase().includes('resume'))playPause.click();
}
function afterFreshMatch(){setTimeout(ensureFreshMatchIsRunning,0)}

newGame?.addEventListener('click',afterFreshMatch,true);
modeSize?.addEventListener('change',afterFreshMatch,true);
formatTabs?.addEventListener('click',event=>{if(event.target.closest('[data-format]'))afterFreshMatch()},true);
ensureFreshMatchIsRunning();

function reportRuntimeFailure(message){
  if(!toast)return;
  toast.textContent=`Gameplay error: ${message}. Start a new match to recover.`;
  toast.classList.add('show');
}
addEventListener('error',event=>reportRuntimeFailure(event.message||'Unexpected runtime failure'));
addEventListener('unhandledrejection',event=>reportRuntimeFailure(event.reason?.message||String(event.reason||'Unexpected CPU failure')));
