import { CubeGameV2, squareKey } from './engine-v2.mjs';

const PATCHED=Symbol.for('cube-chess.cube-promotion-choice');
const PROMOTIONS=['queen','rook','bishop','knight'];
const SHORT_NAMES={q:'queen',r:'rook',b:'bishop',n:'knight'};

export function normalizePromotion(value){
  const answer=String(value||'queen').trim().toLowerCase();
  return PROMOTIONS.includes(answer)?answer:(SHORT_NAMES[answer]||'queen');
}

function defaultPromotionPrompt(){
  if(typeof globalThis.prompt!=='function')return'queen';
  return globalThis.prompt('Promote pawn to:\nQueen (Q)\nRook (R)\nBishop (B)\nKnight (N)','Queen');
}

export function installCubePromotion(GameClass,isActive=game=>!game.config?.classic,askPromotion=defaultPromotionPrompt){
  const proto=GameClass.prototype;
  if(proto[PATCHED])return;
  proto[PATCHED]=true;
  const originalGeneratePseudo=proto.generatePseudo;
  const originalApplyMove=proto.applyMove;
  const originalFormatMove=proto.formatMove;
  const originalPlay=proto.play;

  proto.generatePseudo=function(face,row,col,piece,options={}){
    const moves=originalGeneratePseudo.call(this,face,row,col,piece,options);
    if(!isActive(this)||options.attackMap||piece.type!=='pawn'||piece.cubeEnabled)return moves;
    const army=this.army(piece.armyId);
    for(const move of moves){
      if(move.face===piece.homeFace&&move.row===army.gatewayRow)move.promotionChoices=[...PROMOTIONS];
    }
    return moves;
  };

  proto.applyMove=function(move,options={}){
    if(!isActive(this))return originalApplyMove.call(this,move,options);
    const moving=this.board[squareKey(move.from.face,move.from.row,move.from.col)];
    const army=moving&&this.army(moving.armyId);
    const promotes=moving?.type==='pawn'&&!moving.cubeEnabled&&move.to.face===moving.homeFace&&move.to.row===army?.gatewayRow;
    const choice=promotes?normalizePromotion(move.to.promoteTo):null;
    const result=originalApplyMove.call(this,move,options);
    if(!result||!promotes)return result;
    result.piece.type=choice;
    result.promoted=choice;
    if(options.record!==false&&this.history.length){
      const entry=this.history.at(-1);
      entry.promoted=choice;
      this.lastEvent=this.formatMove(entry);
    }
    return result;
  };

  proto.formatMove=function(move){
    const notation=originalFormatMove.call(this,move);
    return isActive(this)&&typeof move.promoted==='string'?notation.replace(' = queen',` = ${move.promoted}`):notation;
  };

  proto.play=function(move){
    if(!isActive(this))return originalPlay.call(this,move);
    const moving=this.board[squareKey(move.from.face,move.from.row,move.from.col)];
    const army=moving&&this.army(moving.armyId);
    const promotes=moving?.type==='pawn'&&!moving.cubeEnabled&&move.to.face===moving.homeFace&&move.to.row===army?.gatewayRow;
    if(promotes&&!move.to.promoteTo&&army.controller==='human'){
      move={...move,to:{...move.to,promoteTo:normalizePromotion(askPromotion())}};
    }
    return originalPlay.call(this,move);
  };
}

if(typeof location!=='undefined')installCubePromotion(CubeGameV2);
