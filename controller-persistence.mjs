import { CubeGameV2 } from './engine-v2.mjs';

const PATCHED=Symbol.for('cube-chess.controller-persistence');
export const STANDARD_CONTROLLER_KEY='cube-chess-standard-controllers';

export function controllerStorageKey(config={}){
  if(config.classic||config.kind==='classic')return STANDARD_CONTROLLER_KEY;
  return `cube-chess-controllers:${config.kind||'coalition'}:${config.size||1}`;
}

const validControllers=(controllers,count)=>Array.isArray(controllers)&&controllers.length===count&&controllers.every(value=>value==='human'||value==='cpu');

export function installControllerPersistence(GameClass,readControllers,isActive=()=>true){
  const proto=GameClass.prototype;
  if(proto[PATCHED])return;
  proto[PATCHED]=true;
  const originalReset=proto.reset;
  proto.reset=function(...args){
    const result=originalReset.apply(this,args);
    if(!isActive(this))return result;
    const controllers=readControllers(this);
    if(validControllers(controllers,this.armies.length)){
      this.armies.forEach((army,index)=>army.controller=controllers[index]);
    }
    return result;
  };
}

export function installStandardControllerPersistence(GameClass,readControllers,isActive=game=>game.config?.classic===true){
  installControllerPersistence(GameClass,game=>readControllers(game),isActive);
}

if(typeof location!=='undefined'){
  const read=game=>{
    try{return JSON.parse(sessionStorage.getItem(controllerStorageKey(game.config))||'null')}catch{return null}
  };
  installControllerPersistence(CubeGameV2,read);

  const classic=new URLSearchParams(location.search).get('mode')==='classic';
  const seatList=document.querySelector('#seatList');
  const sizeSelect=document.querySelector('#modeSize');
  const currentConfig=()=>{
    if(classic)return{kind:'classic',classic:true,size:1};
    const selected=document.querySelector('#formatTabs [data-format].active');
    return{kind:selected?.dataset.format||new URLSearchParams(location.search).get('format')||'coalition',size:Number(sizeSelect?.value)||1};
  };
  const saveControllers=()=>{
    const controllers=[...(seatList?.querySelectorAll('[data-army]')||[])].map(button=>button.textContent.trim().toLowerCase()==='cpu'?'cpu':'human');
    if(controllers.length<2)return;
    try{sessionStorage.setItem(controllerStorageKey(currentConfig()),JSON.stringify(controllers))}catch{}
  };
  const saveAfterControlChange=()=>queueMicrotask(saveControllers);

  seatList?.addEventListener('click',saveAfterControlChange,true);
  document.querySelector('#humanSide')?.addEventListener('click',saveAfterControlChange,true);
  document.querySelector('#allCpu')?.addEventListener('click',saveAfterControlChange,true);
}
