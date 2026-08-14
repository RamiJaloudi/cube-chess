import { parseKey, squareKey } from './engine-v2.mjs';

const PATCHED=Symbol.for('cube-chess.classic-rules');
const PROMOTIONS=['queen','rook','bishop','knight'];

export function installClassicRules(GameClass,isActive=game=>game.config?.classic===true){
  const proto=GameClass.prototype;
  if(proto[PATCHED])return;
  proto[PATCHED]=true;

  const originalReset=proto.reset;
  const originalClone=proto.clone;
  const originalGeneratePseudo=proto.generatePseudo;
  const originalApplyMove=proto.applyMove;
  const originalFormatMove=proto.formatMove;
  const originalResolveTurnStart=proto.resolveTurnStart;
  const originalPlay=proto.play;

  proto.classicPositionKey=function(){
    const pieces=Object.entries(this.board).sort(([a],[b])=>a.localeCompare(b)).map(([key,piece])=>`${key}:${piece.type}:${piece.armyId}:${piece.hasMoved?1:0}`).join('|');
    const rights=Object.entries(this.enPassant).sort(([a],[b])=>a.localeCompare(b)).map(([army,right])=>`${army}:${squareKey(right.target.face,right.target.row,right.target.col)}`).join('|');
    return`${this.currentArmy().id};${pieces};${rights}`;
  };
  proto.recordClassicPosition=function(){
    const key=this.classicPositionKey();
    this.positionCounts[key]=(this.positionCounts[key]||0)+1;
    return this.positionCounts[key];
  };
  proto.classicInsufficientMaterial=function(){
    const pieces=Object.entries(this.board).filter(([,piece])=>piece.type!=='king');
    if(pieces.some(([,piece])=>['pawn','rook','queen'].includes(piece.type)))return false;
    if(pieces.length<=1)return true;
    if(pieces.every(([,piece])=>piece.type==='bishop')){
      return new Set(pieces.map(([key])=>{const square=parseKey(key);return(square.row+square.col)%2})).size===1;
    }
    return false;
  };

  proto.reset=function(...args){
    const result=originalReset.apply(this,args);
    if(!isActive(this))return result;
    this.config.kind='classic';
    this.config.classic=true;
    this.config.size=1;
    this.config.faces=1;
    this.config.label='Standard Chess';
    this.config.tagline='Traditional 1 vs 1 chess on the floor plane. The cube is the arena, not the board.';
    this.armies=this.armies.slice(0,2);
    const names=[['White','White','#f4f1e8'],['Black','Black','#64a0ff']];
    this.armies.forEach((army,index)=>{
      const [commander,team,color]=names[index]||names[1];
      army.commander=commander;army.team=team;army.color=color;
    });
    const valid=new Set(this.armies.map(army=>army.id));
    for(const [key,piece] of Object.entries(this.board)){
      if(!valid.has(piece.armyId)||!key.startsWith('D,')){delete this.board[key];continue}
      piece.cubeEnabled=false;piece.breachReady=false;
    }
    this.halfmoveClock=0;this.positionCounts={};this.drawReason=null;this.recordClassicPosition();
    return result;
  };

  proto.clone=function(...args){
    const copy=originalClone.apply(this,args);
    if(isActive(this)){
      copy.halfmoveClock=this.halfmoveClock||0;
      copy.positionCounts={...(this.positionCounts||{})};
      copy.drawReason=this.drawReason||null;
    }
    return copy;
  };

  proto.generatePseudo=function(face,row,col,piece,options={}){
    const moves=originalGeneratePseudo.call(this,face,row,col,piece,options);
    if(!isActive(this))return moves;
    const flat=moves.filter(move=>move.face===face&&!move.climb);
    if(!options.attackMap&&piece.type==='pawn'){
      const army=this.army(piece.armyId);
      for(const move of flat)if(move.row===army.gatewayRow)move.promotionChoices=[...PROMOTIONS];
    }
    if(options.attackMap||piece.type!=='king'||piece.hasMoved||col!==4)return flat;
    const army=this.army(piece.armyId);
    if(!army||face!==army.face||row!==(army.side==='A'?7:0)||this.inCheck(piece.armyId))return flat;

    const addCastle=(side,rookCol,destination,rookDestination,emptyCols,transitCols)=>{
      const rook=this.board[squareKey(face,row,rookCol)];
      if(!rook||rook.type!=='rook'||rook.armyId!==piece.armyId||rook.hasMoved)return;
      if(emptyCols.some(testCol=>this.board[squareKey(face,row,testCol)]))return;
      if(transitCols.some(testCol=>this.isSquareAttacked(face,row,testCol,piece.armyId)))return;
      flat.push({face,row,col:destination,capture:false,castle:side,rookFrom:{face,row,col:rookCol},rookTo:{face,row,col:rookDestination}});
    };
    addCastle('king',7,6,5,[5,6],[5,6]);
    addCastle('queen',0,2,3,[1,2,3],[3,2]);
    return flat;
  };

  proto.applyMove=function(move,options={}){
    const classic=isActive(this);
    if(classic&&move.from.face!==move.to.face)return null;
    const moving=this.board[squareKey(move.from.face,move.from.row,move.from.col)];
    const wasPawn=moving?.type==='pawn';
    const castle=classic?move.to.castle:null;
    const rook=castle?this.board[squareKey(move.to.rookFrom.face,move.to.rookFrom.row,move.to.rookFrom.col)]:null;
    const result=originalApplyMove.call(this,move,options);
    if(!result||!classic)return result;
    result.piece.cubeEnabled=false;result.piece.breachReady=false;
    if(wasPawn&&move.to.row===this.army(result.piece.armyId).gatewayRow){
      const choice=PROMOTIONS.includes(move.to.promoteTo)?move.to.promoteTo:'queen';
      result.piece.type=choice;result.promoted=choice;
    }
    if(castle&&rook){
      delete this.board[squareKey(move.to.rookFrom.face,move.to.rookFrom.row,move.to.rookFrom.col)];
      rook.hasMoved=true;rook.cubeEnabled=false;rook.breachReady=false;
      this.board[squareKey(move.to.rookTo.face,move.to.rookTo.row,move.to.rookTo.col)]=rook;
    }
    if(options.record!==false&&this.history.length){
      const entry=this.history.at(-1);
      entry.promoted=result.promoted||false;entry.breachReady=false;entry.climb=false;
      this.lastEvent=this.formatMove(entry);
    }
    return result;
  };

  proto.formatMove=function(move){
    if(!isActive(this))return originalFormatMove.call(this,move);
    const army=this.army(move.armyId);
    if(move.to?.castle)return`${army.commander} | ${move.to.castle==='king'?'O-O':'O-O-O'}`;
    const coordinate=square=>`${String.fromCharCode(65+square.col)}${8-square.row}`;
    const promoted=typeof move.promoted==='string'?move.promoted:move.to?.promoteTo;
    return`${army.commander} | ${move.piece} ${coordinate(move.from)} -> ${coordinate(move.to)}${move.captured?' x '+move.captured:''}${promoted?' = '+promoted:''}`;
  };

  proto.resolveTurnStart=function(...args){
    if(!isActive(this))return originalResolveTurnStart.apply(this,args);
    const army=this.currentArmy(),moves=this.allLegalMoves(army.id),check=this.inCheck(army.id);
    if(!moves.length){
      this.gameOver=true;
      if(check){
        const victor=this.armies.find(candidate=>candidate.id!==army.id);
        this.winner=victor?.team||null;this.drawReason=null;this.lastEvent=`${this.winner} wins by checkmate.`;
        return{type:'game-over',message:this.lastEvent};
      }
      this.winner=null;this.drawReason='stalemate';this.lastEvent='Draw by stalemate.';
      return{type:'draw',message:this.lastEvent};
    }
    if(this.halfmoveClock>=100){this.gameOver=true;this.winner=null;this.drawReason='fifty-move';this.lastEvent='Draw by the fifty-move rule.';return{type:'draw',message:this.lastEvent}}
    if((this.positionCounts[this.classicPositionKey()]||0)>=3){this.gameOver=true;this.winner=null;this.drawReason='threefold-repetition';this.lastEvent='Draw by threefold repetition.';return{type:'draw',message:this.lastEvent}}
    if(this.classicInsufficientMaterial()){this.gameOver=true;this.winner=null;this.drawReason='insufficient-material';this.lastEvent='Draw by insufficient material.';return{type:'draw',message:this.lastEvent}}
    this.lastEvent=check?`${army.commander}'s king is in check.`:`${army.commander} to move.`;
    return{type:check?'check':'turn',message:this.lastEvent,moves:moves.length};
  };

  proto.play=function(move){
    if(!isActive(this))return originalPlay.call(this,move);
    if(this.gameOver)return null;
    const moving=this.board[squareKey(move.from.face,move.from.row,move.from.col)];
    if(!moving)return null;
    if(moving.type==='pawn'&&move.to.row===this.army(moving.armyId).gatewayRow&&!move.to.promoteTo&&this.currentArmy().controller==='human'&&typeof globalThis.prompt==='function'){
      const answer=String(globalThis.prompt('Promote to queen, rook, bishop, or knight:','queen')||'queen').trim().toLowerCase();
      move={...move,to:{...move.to,promoteTo:PROMOTIONS.includes(answer)?answer:'queen'}};
    }
    const wasPawn=moving.type==='pawn';
    const result=this.applyMove(move);
    if(!result)return null;
    this.halfmoveClock=wasPawn||result.captured?0:(this.halfmoveClock||0)+1;
    this.advanceTurn();this.recordClassicPosition();
    const state=this.resolveTurnStart();
    return{...result,state};
  };
}
