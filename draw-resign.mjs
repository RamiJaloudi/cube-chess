import { CubeGameV2, PIECE_VALUE } from './engine-v2.mjs';

const PATCHED=Symbol.for('cube-chess.draw-resign');
const renderedPieces=new Set();
let activeGame=null;

export function currentCubeGame(){return activeGame}

export function installDrawResignRules(GameClass){
  const proto=GameClass.prototype;
  if(proto[PATCHED])return;
  proto[PATCHED]=true;
  const originalReset=proto.reset;

  proto.reset=function(...args){
    const result=originalReset.apply(this,args);
    this.drawReason=null;
    activeGame=this;
    return result;
  };

  proto.resignCurrentArmy=function(){
    if(this.gameOver)return null;
    const resigned=this.currentArmy();
    const piecesRemain=this.config.kind==='ffa';
    this.eliminated.add(resigned.id);
    if(!piecesRemain)this.removeArmy(resigned.id);
    this.advanceTurn();
    const teams=this.activeTeams();
    let state;
    if(teams.size<=1){
      this.gameOver=true;
      this.winner=[...teams][0]||null;
      this.lastEvent=`${resigned.commander} resigned. ${this.winner||'Nobody'} wins ${this.config.label}.`;
      state={type:'game-over',message:this.lastEvent};
    }else{
      state=this.resolveTurnStart();
      const reminder=piecesRemain?' Their pieces remain on the board.':'';
      this.lastEvent=`${resigned.commander} resigned.${reminder} ${this.currentArmy().commander} is next.`;
      state={type:'resignation',message:this.lastEvent,next:state};
    }
    return{army:resigned,state,piecesRemain};
  };

  proto.agreeDraw=function(offeredBy=this.currentArmy()?.id){
    if(this.gameOver)return null;
    const offerer=this.army(offeredBy);
    this.gameOver=true;this.winner=null;this.drawReason='agreement';
    this.lastEvent=`Draw agreed${offerer?` after ${offerer.commander}'s offer`:''}.`;
    return{type:'draw',reason:'agreement',message:this.lastEvent};
  };
}

export function teamMaterial(game,team){
  let total=0;
  for(const piece of Object.values(game.board))if(game.army(piece.armyId)?.team===team)total+=PIECE_VALUE[piece.type]||0;
  return total;
}

export function cpuAcceptsDraw(game,cpuTeam,offeringTeam){
  const own=teamMaterial(game,cpuTeam),offering=teamMaterial(game,offeringTeam),moves=game.history.length;
  return(moves>=20&&own<=offering)||(moves>=8&&own*4<offering*3);
}

installDrawResignRules(CubeGameV2);

if(typeof document!=='undefined'){
  const THREE=globalThis.THREE;
  if(THREE?.Object3D?.prototype){
    const originalAdd=THREE.Object3D.prototype.add;
    THREE.Object3D.prototype.add=function(...objects){
      const result=originalAdd.apply(this,objects);
      for(const object of objects)if(object?.userData?.armyId)renderedPieces.add(object);
      return result;
    };
  }

  const setup=document.querySelector('#setupPanel');
  const newGame=document.querySelector('#newGame');
  const actionRow=document.createElement('div');
  actionRow.className='transport match-decision-actions';
  actionRow.innerHTML='<button id="offerDraw" class="secondary" type="button" title="A draw requires every remaining opposing team to accept.">Offer Draw</button><button id="resignArmy" class="secondary danger-action" type="button" title="Resign the army whose turn it is.">Resign</button>';
  newGame?.before(actionRow);
  const offerButton=actionRow.querySelector('#offerDraw');
  const resignButton=actionRow.querySelector('#resignArmy');

  const style=document.createElement('style');
  style.textContent='.match-decision-actions{margin-top:8px}.match-decision-actions button{min-width:0}.match-decision-actions .danger-action{border-color:rgba(255,91,95,.58);color:#ffb8ba}.match-decision-actions .danger-action:hover{background:rgba(255,91,95,.14)}';
  document.head.appendChild(style);

  const notify=message=>{
    const toast=document.querySelector('#toast');
    if(!toast)return;
    toast.textContent=message;toast.classList.add('show');
    setTimeout(()=>toast.classList.remove('show'),3200);
  };
  const removeRenderedArmy=armyId=>{
    for(const object of renderedPieces)if(object.userData.armyId===armyId){object.parent?.remove(object);renderedPieces.delete(object)}
  };
  const refreshGameUi=()=>{
    const game=currentCubeGame();
    if(!game)return;
    const current=game.currentArmy();
    const button=document.querySelector(`#seatList [data-army="${current?.id}"]`);
    if(button&&!button.disabled){button.click();button.click()}
    offerButton.disabled=!!game.gameOver;resignButton.disabled=!!game.gameOver;
  };
  const opposingTeams=game=>{
    const offerer=game.currentArmy();
    return[...new Set(game.armies.filter(army=>!game.eliminated.has(army.id)&&army.team!==offerer.team).map(army=>army.team))];
  };

  offerButton.addEventListener('click',()=>{
    const game=currentCubeGame();if(!game||game.gameOver)return;
    const offerer=game.currentArmy(),teams=opposingTeams(game);
    for(const team of teams){
      const human=game.armies.find(army=>army.team===team&&!game.eliminated.has(army.id)&&army.controller==='human');
      const accepted=human?globalThis.confirm(`${team}: accept the draw offered by ${offerer.commander}?`):cpuAcceptsDraw(game,team,offerer.team);
      if(!accepted){notify(`${team} declined ${offerer.commander}'s draw offer.`);return}
    }
    const result=game.agreeDraw(offerer.id);refreshGameUi();notify(result.message);
  });

  resignButton.addEventListener('click',()=>{
    const game=currentCubeGame();if(!game||game.gameOver)return;
    const army=game.currentArmy();
    if(!globalThis.confirm(`${army.commander} (${army.face}${army.side}) resigns this army?`))return;
    const result=game.resignCurrentArmy();
    if(!result.piecesRemain)removeRenderedArmy(army.id);
    refreshGameUi();notify(result.state.message);
  });

  newGame?.addEventListener('click',()=>queueMicrotask(refreshGameUi),true);
  const turnHero=document.querySelector('#turnHero');
  if(turnHero)new MutationObserver(()=>{
    const game=currentCubeGame();
    if(game){offerButton.disabled=!!game.gameOver;resignButton.disabled=!!game.gameOver}
  }).observe(turnHero,{childList:true,subtree:true});
  if(!setup)actionRow.hidden=true;
}
