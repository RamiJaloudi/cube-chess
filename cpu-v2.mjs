import { PIECE_VALUE, squareKey } from './engine-v2.mjs';

function advancement(piece,from,to){
  if(piece.cubeEnabled||from.face!==to.face)return 0;
  return piece.forward===-1?(from.row-to.row):(to.row-from.row);
}
function score(game,move,style){
  const piece=game.board[squareKey(move.from.face,move.from.row,move.from.col)],captured=game.board[squareKey(move.to.face,move.to.row,move.to.col)],copy=game.clone();
  const result=copy.applyMove(move,{record:false});let value=(Math.random()-.5)*(style==='casual'?130:style==='sharp'?12:42);
  if(captured)value+=PIECE_VALUE[captured.type]*1.3;
  value+=advancement(piece,move.from,move.to)*(piece.type==='pawn'?32:14);
  if(move.to.climb)value+=720;
  if(result?.piece?.breachReady)value+=360;
  if(result?.promoted)value+=850;
  if(result?.piece?.cubeEnabled&&move.to.face!==move.from.face)value+=55;
  if(copy.isSquareAttacked(move.to.face,move.to.row,move.to.col,piece.armyId))value-=PIECE_VALUE[piece.type]*(style==='sharp'?.72:.38);
  for(const army of copy.armies){if(!copy.allied(piece.armyId,army.id)&&!copy.eliminated.has(army.id)&&copy.inCheck(army.id))value+=160}
  return value;
}
export function chooseCpuMove(game,armyId,style='standard'){
  const moves=game.allLegalMoves(armyId);if(!moves.length)return null;
  const ranked=moves.map(move=>({move,value:score(game,move,style)})).sort((a,b)=>b.value-a.value),width=style==='casual'?Math.min(7,ranked.length):style==='sharp'?Math.min(2,ranked.length):Math.min(4,ranked.length);
  return ranked[Math.floor(Math.pow(Math.random(),2)*width)].move;
}
