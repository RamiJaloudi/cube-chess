import { CubeGameV2 } from './engine-v2.mjs';
import { PALETTES, hexNumber, hexToRgb, themeFor } from './palettes.mjs';
import { installPaletteRules } from './palette-engine.mjs';

const params=new URLSearchParams(location.search);
const theme=themeFor(params.get('palette')||'default');
let currentGame=null;
installPaletteRules(CubeGameV2,theme,game=>currentGame=game);

document.documentElement.classList.add('palette-themed');
document.documentElement.dataset.palette=theme.id;
const rootStyle=document.documentElement.style;
const panelRgb=hexToRgb(theme.panel);
rootStyle.setProperty('--bg',theme.background);
rootStyle.setProperty('--accent',theme.accent);
rootStyle.setProperty('--theme-panel',theme.panel);
rootStyle.setProperty('--theme-panel-glass',`rgba(${panelRgb.r},${panelRgb.g},${panelRgb.b},.9)`);
rootStyle.setProperty('--theme-board-light',theme.boardLight);
rootStyle.setProperty('--theme-board-dark',theme.boardDark);

const OriginalScene=THREE.Scene;
let capturedScene=null;
THREE.Scene=class PaletteScene extends OriginalScene{
  constructor(...args){super(...args);capturedScene=this;}
};

function applyScenePalette(){
  const scene=capturedScene;
  if(!scene)return;
  scene.background?.set(theme.background);
  scene.fog?.color?.set(theme.background);
  let lightIndex=0;
  scene.traverse(object=>{
    if(object.userData?.face&&Number.isInteger(object.userData.row)&&Number.isInteger(object.userData.col)){
      const color=(object.userData.row+object.userData.col)%2===0?theme.boardLight:theme.boardDark;
      object.userData.base=hexNumber(color);
      object.material?.color?.set(color);
    }else if(object.isPointLight){
      object.color.set(theme.colors[lightIndex++%theme.colors.length]);
    }else if(object.isPoints){
      object.material?.color?.set(theme.accent);
    }
  });
}

const options=Object.entries(PALETTES).map(([id,palette])=>`<option value="${id}">${palette.name}</option>`).join('');
function paletteControl(compact=false){
  const label=document.createElement('label');
  label.className=`palette-control${compact?' compact':''}`;
  label.innerHTML=`<span>${compact?'Arena palette':'Visual palette'}<small>${compact?'new match':'starts a fresh match'}</small></span><span class="palette-choice"><i class="palette-swatches">${theme.colors.map(color=>`<b style="background:${color}"></b>`).join('')}</i><select aria-label="Visual palette">${options}</select></span>`;
  const select=label.querySelector('select');select.value=theme.id;
  select.addEventListener('change',()=>{
    const url=new URL(location.href);
    url.searchParams.set('palette',select.value);
    const activeFormat=document.querySelector('#formatTabs [data-format].active')?.dataset.format;
    const size=document.querySelector('#modeSize')?.value;
    if(activeFormat)url.searchParams.set('format',activeFormat);
    if(size)url.searchParams.set('size',size);
    if(document.querySelector('#allCpu')?.classList.contains('spectator-active'))url.searchParams.set('spectator','1');
    const pace=document.querySelector('#cpuPace')?.value;if(pace)url.searchParams.set('pace',pace);
    location.assign(url);
  });
  return label;
}

const setupCard=document.querySelector('.mode-card');
setupCard?.insertAdjacentElement('afterend',paletteControl());
document.querySelector('#studyDock .study-speed')?.insertAdjacentElement('afterend',paletteControl(true));

setTimeout(()=>{
  applyScenePalette();
  const requestedSize=params.get('size'),sizeSelect=document.querySelector('#modeSize');
  if(requestedSize&&sizeSelect&&[...sizeSelect.options].some(option=>option.value===requestedSize)){
    sizeSelect.value=requestedSize;sizeSelect.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const requestedPace=params.get('pace'),paceSelect=document.querySelector('#cpuPace');
  if(requestedPace&&paceSelect&&[...paceSelect.options].some(option=>option.value===requestedPace)){
    paceSelect.value=requestedPace;paceSelect.dispatchEvent(new Event('change',{bubbles:true}));
  }
  if(params.get('spectator')==='1')document.querySelector('#allCpu')?.click();
},0);
setTimeout(applyScenePalette,180);
