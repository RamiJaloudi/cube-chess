import { CubeGameV2 } from './engine-v2.mjs';
import { installClassicRules } from './classic-engine.mjs';

const params=new URLSearchParams(location.search);
const classic=params.get('mode')==='classic';
installClassicRules(CubeGameV2,()=>classic);

const tabs=document.querySelector('#formatTabs');
const standardButton=document.querySelector('#standardMode');
const sizeRow=document.querySelector('.mode-size');
const sizeSelect=document.querySelector('#modeSize');
const sizeLabel=document.querySelector('#sizeLabel');
const ruleStrip=document.querySelector('.rule-strip');

function navigate(query){
  const url=new URL(location.href);
  url.search=query;
  location.assign(url);
}
function lockStandardSize(){
  if(!classic)return;
  if(sizeRow)sizeRow.hidden=false;
  if(sizeLabel)sizeLabel.textContent='Players';
  if(sizeSelect){
    sizeSelect.innerHTML='<option value="1">1 vs 1</option>';
    sizeSelect.value='1';sizeSelect.disabled=true;
    sizeSelect.setAttribute('aria-label','Standard Chess player count, fixed at one versus one');
    sizeSelect.title='Standard Chess is always 1 vs 1.';
  }
}

standardButton?.addEventListener('click',event=>{
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!classic)navigate('?mode=classic');
},true);

if(classic){
  document.documentElement.classList.add('classic-mode');
  document.title='Cube Chess - Standard Chess';
  tabs?.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button===standardButton));
  lockStandardSize();
  setTimeout(lockStandardSize,0);
  if(ruleStrip)ruleStrip.innerHTML='<b>STANDARD CHESS</b><span>Traditional 1 vs 1 chess on one 8x8 plane. No gateways or cube travel.</span>';
  const humanSide=document.querySelector('#humanSide');
  if(humanSide)humanSide.textContent='Human vs CPU';
  tabs?.addEventListener('click',event=>{
    const formatButton=event.target.closest('[data-format]');
    if(!formatButton)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(`?format=${formatButton.dataset.format}`);
  },true);
}else{
  const requested=params.get('format');
  if(requested)setTimeout(()=>tabs?.querySelector(`[data-format="${requested}"]`)?.click(),0);
}
