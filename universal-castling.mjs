import { squareKey } from './engine-v2.mjs';

const PATCHED=Symbol.for('cube-chess.universal-castling');

export function installUniversalCastling(GameClass){
  const proto=GameClass.prototype;
  if(proto[PATCHED])return;
  proto[PATCHED]=true;

  const originalGeneratePseudo=proto.generatePseudo;
  const originalApplyMove=proto.applyMove;
  const originalFormatMove=proto.formatMove;

  proto.generatePseudo=function(face,row,col,piece,options={}){
    const moves=originalGeneratePseudo.call(this,face,row,col,piece,options);
    if(options.attackMap||piece.type!=='king'||piece.hasMoved||piece.cubeEnabled||col!==4||moves.some(move=>move.castle))return moves;
    const army=this.army(piece.armyId);
    const homeRow=army?.side==='A'?7:0;
    if(!army||face!==army.face||row!==homeRow||this.inCheck(piece.armyId))return moves;

    const addCastle=(side,rookCol,destination,rookDestination,emptyCols,transitCols)=>{
      const rook=this.board[squareKey(face,row,rookCol)];
      if(!rook||rook.type!=='rook'||rook.armyId!==piece.armyId||rook.hasMoved||rook.cubeEnabled)return;
      if(emptyCols.some(testCol=>this.board[squareKey(face,row,testCol)]))return;
      if(transitCols.some(testCol=>this.isSquareAttacked(face,row,testCol,piece.armyId)))return;
      moves.push({face,row,col:destination,capture:false,castle:side,rookFrom:{face,row,col:rookCol},rookTo:{face,row,col:rookDestination}});
    };

    addCastle('king',7,6,5,[5,6],[5,6]);
    addCastle('queen',0,2,3,[1,2,3],[3,2]);
    return moves;
  };

  proto.applyMove=function(move,options={}){
    const castle=move.to?.castle;
    const rook=castle?this.board[squareKey(move.to.rookFrom.face,move.to.rookFrom.row,move.to.rookFrom.col)]:null;
    const result=originalApplyMove.call(this,move,options);
    if(!result||!castle||!rook)return result;
    delete this.board[squareKey(move.to.rookFrom.face,move.to.rookFrom.row,move.to.rookFrom.col)];
    rook.hasMoved=true;
    rook.breachReady=false;
    this.board[squareKey(move.to.rookTo.face,move.to.rookTo.row,move.to.rookTo.col)]=rook;
    if(options.record!==false&&this.history.length)this.lastEvent=this.formatMove(this.history.at(-1));
    return result;
  };

  proto.formatMove=function(move){
    if(move.to?.castle){
      const army=this.army(move.armyId);
      return`${army.commander} · ${army.face}${army.side} · ${move.to.castle==='king'?'O-O':'O-O-O'}`;
    }
    return originalFormatMove.call(this,move);
  };
}
