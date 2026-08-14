export const N=8;
export const FACE_ORDER=['D','U','F','B','L','R'];
export const PIECE_VALUE={pawn:100,knight:320,bishop:340,rook:500,queen:900,king:20000};
export const FACES={
  F:{normal:[0,0,1],right:[1,0,0],up:[0,1,0]},B:{normal:[0,0,-1],right:[-1,0,0],up:[0,1,0]},
  U:{normal:[0,1,0],right:[0,0,1],up:[1,0,0]},D:{normal:[0,-1,0],right:[0,0,-1],up:[1,0,0]},
  R:{normal:[1,0,0],right:[0,1,0],up:[0,0,1]},L:{normal:[-1,0,0],right:[0,-1,0],up:[0,0,1]},
};
for(const f of Object.values(FACES))f.center=f.normal;
const PALETTE=['#ff5b5f','#64a0ff','#ffd44d','#f4f1e8','#b66cff','#49d8a5','#ff8a45','#55d6ff','#e66baf','#9bd84b','#a7a0ff','#d8a46b'];
const BACK=['R','N','B','Q','K','B','N','R'],NAMES={R:'rook',N:'knight',B:'bishop',Q:'queen',K:'king'};
const ORTHO=[[-1,0],[1,0],[0,-1],[0,1]],DIAG=[[-1,-1],[-1,1],[1,-1],[1,1]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],scl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const colToU=c=>-1+(c+.5)*(2/N),rowToV=r=>1-(r+.5)*(2/N),uToCol=u=>(u+1)*(N/2)-.5,vToRow=v=>(1-v)*(N/2)-.5,clamp=n=>Math.max(0,Math.min(N-1,n));
const faceByNormal=n=>Object.keys(FACES).find(k=>FACES[k].normal.every((v,i)=>Math.abs(v-n[i])<.001));
export const squareKey=(f,r,c)=>`${f},${r},${c}`;
export const parseKey=k=>{const[f,r,c]=k.split(',');return{face:f,row:+r,col:+c}};

const COALITION_NAMES={1:'Face-Off',2:'Double Bind',3:'Triple Threat',4:'Fourfront',5:'Five-Alarm Siege',6:'Against All Sides'};
const TEAM_NAMES={2:'Crossfire',3:'Tri-Axis',4:'Fourfront War',5:'Pressure Cube',6:'Total Cube War'};
const FFA_NAMES={4:'Free-4-All',6:'Hex Havoc',8:'Octa-Brawl',10:'Deca-Clash',12:'Mindfield'};

function newArmy(face,side,index,overrides={}){
  return {id:`${face}-${side}`,face,side,forward:side==='A'?-1:1,gatewayRow:side==='A'?0:7,color:PALETTE[index],label:`${face}-${side}`,...overrides};
}
export function makeConfig(kind='coalition',size=1){
  if(kind==='faceoff'){kind='coalition';size=1;}
  if(kind==='ffa'){
    const players=Math.max(4,Math.min(12,size+(size%2)));const faces=players/2,armies=[];
    for(let i=0;i<faces;i++){const face=FACE_ORDER[i];armies.push(newArmy(face,'A',i*2,{team:`Solo-${i*2+1}`,commander:`Player ${i*2+1}`,controller:i===0?'human':'cpu'}));armies.push(newArmy(face,'B',i*2+1,{team:`Solo-${i*2+2}`,commander:`Player ${i*2+2}`,controller:'cpu'}));}
    return{kind,size:players,faces,label:FFA_NAMES[players]||`${players}-Player Melee`,tagline:players===12?'12 minds, where every surface is a threat.':'Every breakthrough opens a new front.',armies};
  }
  const faces=Math.max(1,Math.min(6,size)),armies=[];
  for(let i=0;i<faces;i++){
    const face=FACE_ORDER[i];
    if(kind==='teams'){
      armies.push(newArmy(face,'A',i*2,{team:'Axis A',commander:`A${i+1}`,controller:i===0?'human':'cpu'}));
      armies.push(newArmy(face,'B',i*2+1,{team:'Axis B',commander:`B${i+1}`,controller:'cpu'}));
    }else{
      armies.push(newArmy(face,'A',i*2,{team:'Solo',commander:'Solo Commander',controller:'human'}));
      armies.push(newArmy(face,'B',i*2+1,{team:'Coalition',commander:`Rival ${i+1}`,controller:'cpu'}));
    }
  }
  const label=kind==='teams'?(TEAM_NAMES[faces]||`${faces}v${faces}`):COALITION_NAMES[faces];
  return{kind,size:faces,faces,label,tagline:kind==='teams'?`${faces} armies per side across ${faces} planes.`:faces===1?'Ordinary chess begins the journey into the cube.':`One commander controls ${faces} armies against ${faces} rivals.`,armies};
}

export function crossEdge(face,row,col,dRow,dCol){
  const f=FACES[face],overCol=dCol!==0;let u,v,sign;
  if(overCol){sign=dCol;u=sign;v=rowToV(row)}else{sign=-dRow;v=sign;u=colToU(col)}
  const point=add(f.center,add(scl(f.right,u),scl(f.up,v))),neighbor=faceByNormal(scl(overCol?f.right:f.up,sign)),nf=FACES[neighbor],diff=sub(point,nf.center),nu=dot(diff,nf.right),nv=dot(diff,nf.up);
  let nr,nc,ndr,ndc;
  if(Math.abs(nu)>=Math.abs(nv)){ndc=nu>0?-1:1;ndr=0;nc=nu>0?N-1:0;nr=Math.round(vToRow(nv))}else{ndr=nv>0?1:-1;ndc=0;nr=nv>0?0:N-1;nc=Math.round(uToCol(nu))}
  return{face:neighbor,row:clamp(nr),col:clamp(nc),dRow:ndr,dCol:ndc};
}
export function nextOrthogonal(face,row,col,dRow,dCol){const nr=row+dRow,nc=col+dCol;return nr>=0&&nr<N&&nc>=0&&nc<N?{face,row:nr,col:nc,dRow,dCol}:crossEdge(face,row,col,dRow,dCol)}
function worldDir(face,dRow,dCol){const f=FACES[face];return add(scl(f.right,dCol),scl(f.up,-dRow))}
function localDir(face,vector){const f=FACES[face];return{dRow:Math.round(-dot(vector,f.up)),dCol:Math.round(dot(vector,f.right))}}
function diagonalAcross(face,row,col,dRow,dCol,axis,corner){
  const f=FACES[face],primary=axis==='row'?crossEdge(face,row,col,dRow,0):crossEdge(face,row,col,0,dCol),parallelWorld=axis==='row'?scl(f.right,dCol):scl(f.up,-dRow),parallel=localDir(primary.face,parallelWorld);
  return{face:primary.face,row:clamp(primary.row+(corner?0:parallel.dRow)),col:clamp(primary.col+(corner?0:parallel.dCol)),dRow:primary.dRow+parallel.dRow,dCol:primary.dCol+parallel.dCol,cornerChoice:corner};
}
export function nextDiagonal(face,row,col,dRow,dCol){
  const nr=row+dRow,nc=col+dCol,rowOut=nr<0||nr>=N,colOut=nc<0||nc>=N;
  if(!rowOut&&!colOut)return[{face,row:nr,col:nc,dRow,dCol,cornerChoice:false}];
  if(rowOut&&colOut){const out=[diagonalAcross(face,row,col,dRow,dCol,'row',true),diagonalAcross(face,row,col,dRow,dCol,'col',true)];return out.filter((x,i)=>out.findIndex(y=>squareKey(x.face,x.row,x.col)===squareKey(y.face,y.row,y.col))===i)}
  return[diagonalAcross(face,row,col,dRow,dCol,rowOut?'row':'col',false)];
}
function stepFrame(state,axis){
  const dir=state[axis],other=axis==='a'?'b':'a',fromFace=state.face,next=nextOrthogonal(state.face,state.row,state.col,dir.dRow,dir.dCol);
  if(next.face===fromFace)return{...state,face:next.face,row:next.row,col:next.col};
  const moved={dRow:next.dRow,dCol:next.dCol},parallel=localDir(next.face,worldDir(fromFace,state[other].dRow,state[other].dCol));
  return{face:next.face,row:next.row,col:next.col,a:axis==='a'?moved:parallel,b:axis==='b'?moved:parallel};
}
function cubeKnight(face,row,col){
  const out=new Map();
  for(const[adr,adc]of ORTHO)for(const[bdr,bdc]of ORTHO){if(adr*bdr+adc*bdc!==0)continue;let s={face,row,col,a:{dRow:adr,dCol:adc},b:{dRow:bdr,dCol:bdc}};s=stepFrame(s,'a');s=stepFrame(s,'a');s=stepFrame(s,'b');out.set(squareKey(s.face,s.row,s.col),{face:s.face,row:s.row,col:s.col})}
  return[...out.values()];
}

export class CubeGameV2{
  constructor(config=makeConfig('coalition',1)){this.config=config;this.armies=config.armies.map(a=>({...a}));this.reset()}
  reset(){
    this.board={};this.turnIndex=0;this.eliminated=new Set();this.history=[];this.gameOver=false;this.winner=null;this.lastEvent='';this.enPassant={};this.id=1;
    for(const army of this.armies){const back=army.side==='A'?7:0,pawns=army.side==='A'?6:1;for(let col=0;col<N;col++){this.board[squareKey(army.face,back,col)]={id:this.id++,type:NAMES[BACK[col]],armyId:army.id,homeFace:army.face,forward:army.forward,cubeEnabled:false,breachReady:false,hasMoved:false};this.board[squareKey(army.face,pawns,col)]={id:this.id++,type:'pawn',armyId:army.id,homeFace:army.face,forward:army.forward,cubeEnabled:false,breachReady:false,hasMoved:false}}}
  }
  clone(){const c=Object.create(CubeGameV2.prototype);c.config=this.config;c.armies=this.armies.map(a=>({...a}));c.board=Object.fromEntries(Object.entries(this.board).map(([k,v])=>[k,{...v}]));c.turnIndex=this.turnIndex;c.eliminated=new Set(this.eliminated);c.history=this.history.slice();c.gameOver=this.gameOver;c.winner=this.winner;c.lastEvent=this.lastEvent;c.enPassant=JSON.parse(JSON.stringify(this.enPassant));c.id=this.id;return c}
  army(id){return this.armies.find(a=>a.id===id)}currentArmy(){return this.armies[this.turnIndex]}pieceAt(s){return this.board[squareKey(s.face,s.row,s.col)]}
  allied(a,b){return this.army(a)?.team===this.army(b)?.team}findKing(armyId){for(const[k,p]of Object.entries(this.board))if(p.armyId===armyId&&p.type==='king')return parseKey(k);return null}
  generatePseudo(face,row,col,piece,{attackMap=false}={}){
    const anchored=!piece.cubeEnabled,moves=new Map(),me=piece.armyId;
    const addMove=(sq,capture=false,extra={})=>moves.set(squareKey(sq.face,sq.row,sq.col),{face:sq.face,row:sq.row,col:sq.col,capture,...extra});
    const tryAdd=sq=>{const occ=this.pieceAt(sq);if(occ){if(!this.allied(me,occ.armyId)&&(attackMap||occ.type!=='king'))addMove(sq,true,{capturedType:occ.type});return false}addMove(sq,false);return true};
    const slideFlat=(dr,dc)=>{for(let r=row+dr,c=col+dc;r>=0&&r<N&&c>=0&&c<N;r+=dr,c+=dc)if(!tryAdd({face,row:r,col:c}))break};
    const slideOrtho=(dr,dc)=>{if(anchored){slideFlat(dr,dc);return}let cur={face,row,col,dRow:dr,dCol:dc};const seen=new Set();for(let i=0;i<48;i++){cur=nextOrthogonal(cur.face,cur.row,cur.col,cur.dRow,cur.dCol);const state=`${squareKey(cur.face,cur.row,cur.col)},${cur.dRow},${cur.dCol}`;if(seen.has(state))break;seen.add(state);if(!tryAdd(cur))break}};
    const slideDiag=(dr,dc)=>{if(anchored){slideFlat(dr,dc);return}let frontier=[{face,row,col,dRow:dr,dCol:dc}],seen=new Set();for(let step=0;step<48&&frontier.length;step++){const next=[];for(const cur of frontier)for(const sq of nextDiagonal(cur.face,cur.row,cur.col,cur.dRow,cur.dCol)){const state=`${squareKey(sq.face,sq.row,sq.col)},${sq.dRow},${sq.dCol}`;if(seen.has(state))continue;seen.add(state);if(tryAdd(sq))next.push(sq)}frontier=next}};
    if(piece.type==='rook'||piece.type==='queen')ORTHO.forEach(d=>slideOrtho(...d));
    if(piece.type==='bishop'||piece.type==='queen')DIAG.forEach(d=>slideDiag(...d));
    if(piece.type==='knight'){
      const targets=anchored?[[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]].map(([dr,dc])=>({face,row:row+dr,col:col+dc})).filter(s=>s.row>=0&&s.row<N&&s.col>=0&&s.col<N):cubeKnight(face,row,col);
      for(const sq of targets){const occ=this.pieceAt(sq);if(!occ||(!this.allied(me,occ.armyId)&&(attackMap||occ.type!=='king')))addMove(sq,!!occ,{capturedType:occ?.type})}
    }
    if(piece.type==='king'){
      for(const[dr,dc]of ORTHO){const targets=anchored?(row+dr>=0&&row+dr<N&&col+dc>=0&&col+dc<N?[{face,row:row+dr,col:col+dc}]:[]):[nextOrthogonal(face,row,col,dr,dc)];for(const sq of targets){const occ=this.pieceAt(sq);if(!occ||(!this.allied(me,occ.armyId)&&(attackMap||occ.type!=='king')))addMove(sq,!!occ,{capturedType:occ?.type})}}
      for(const[dr,dc]of DIAG){const targets=anchored?(row+dr>=0&&row+dr<N&&col+dc>=0&&col+dc<N?[{face,row:row+dr,col:col+dc}]:[]):nextDiagonal(face,row,col,dr,dc);for(const sq of targets){const occ=this.pieceAt(sq);if(!occ||(!this.allied(me,occ.armyId)&&(attackMap||occ.type!=='king')))addMove(sq,!!occ,{capturedType:occ?.type,cornerChoice:sq.cornerChoice})}}
    }
    if(piece.type==='pawn'){
      const fwd=piece.forward;
      if(!attackMap&&row+fwd>=0&&row+fwd<N){const one={face,row:row+fwd,col};if(!this.pieceAt(one)){addMove(one,false);const home=fwd===-1?6:1;if(row===home){const two={face,row:row+2*fwd,col};if(!this.pieceAt(two))addMove(two,false,{double:true,skipped:one})}}}
      for(const dc of[-1,1]){const r=row+fwd,c=col+dc;if(r<0||r>=N||c<0||c>=N)continue;const sq={face,row:r,col:c},occ=this.pieceAt(sq);if(attackMap)addMove(sq,true);else if(occ&&!this.allied(me,occ.armyId)&&occ.type!=='king')addMove(sq,true,{capturedType:occ.type});else{const ep=this.enPassant[me];if(ep&&squareKey(face,r,c)===squareKey(ep.target.face,ep.target.row,ep.target.col))addMove(sq,true,{capturedType:'pawn',enPassant:true,captureSquare:ep.captureSquare})}}
    }
    if(anchored&&piece.breachReady&&!attackMap){const climb=nextOrthogonal(face,row,col,piece.forward,0);if(!this.pieceAt(climb))addMove(climb,false,{climb:true})}
    return[...moves.values()];
  }
  isSquareAttacked(face,row,col,defenderArmy){for(const[k,p]of Object.entries(this.board)){if(this.allied(p.armyId,defenderArmy)||this.eliminated.has(p.armyId))continue;const s=parseKey(k);if(this.generatePseudo(s.face,s.row,s.col,p,{attackMap:true}).some(m=>m.face===face&&m.row===row&&m.col===col))return true}return false}
  inCheck(armyId){const k=this.findKing(armyId);return k?this.isSquareAttacked(k.face,k.row,k.col,armyId):true}
  legalMovesAt(face,row,col){const piece=this.board[squareKey(face,row,col)];if(!piece||this.eliminated.has(piece.armyId))return[];return this.generatePseudo(face,row,col,piece).filter(to=>{const copy=this.clone();copy.applyMove({from:{face,row,col},to,piece:piece.type},{record:false});return!copy.inCheck(piece.armyId)})}
  allLegalMoves(armyId){const out=[];for(const[k,p]of Object.entries(this.board)){if(p.armyId!==armyId)continue;const from=parseKey(k);for(const to of this.legalMovesAt(from.face,from.row,from.col))out.push({from,to,piece:p.type})}return out}
  applyMove(move,{record=true}={}){
    const fromKey=squareKey(move.from.face,move.from.row,move.from.col),toKey=squareKey(move.to.face,move.to.row,move.to.col),piece=this.board[fromKey];if(!piece)return null;
    delete this.enPassant[piece.armyId];const captureKey=move.to.enPassant?squareKey(move.to.captureSquare.face,move.to.captureSquare.row,move.to.captureSquare.col):toKey,captured=this.board[captureKey];
    delete this.board[fromKey];if(move.to.enPassant)delete this.board[captureKey];let promoted=false;
    if(move.to.climb){piece.cubeEnabled=true;piece.breachReady=false}else if(!piece.cubeEnabled){const army=this.army(piece.armyId);piece.breachReady=move.to.face===piece.homeFace&&move.to.row===army.gatewayRow;if(piece.type==='pawn'&&piece.breachReady){piece.type='queen';promoted=true}}
    piece.hasMoved=true;this.board[toKey]=piece;
    if(move.to.double){const rival=this.armies.find(a=>a.face===piece.homeFace&&a.id!==piece.armyId);if(rival)this.enPassant[rival.id]={target:move.to.skipped,captureSquare:{face:move.to.face,row:move.to.row,col:move.to.col},pawnId:piece.id}}
    if(record){const entry={turn:this.history.length+1,armyId:piece.armyId,piece:move.piece||piece.type,from:move.from,to:move.to,captured:captured?.type||null,promoted,climb:!!move.to.climb,breachReady:piece.breachReady};this.history.push(entry);this.lastEvent=this.formatMove(entry)}
    return{piece,captured,promoted};
  }
  formatMove(m){const a=this.army(m.armyId);return`${a.commander} · ${a.face}${a.side} ${m.piece} ${m.from.face}${m.from.row+1}${String.fromCharCode(65+m.from.col)} → ${m.to.face}${m.to.row+1}${String.fromCharCode(65+m.to.col)}${m.captured?' × '+m.captured:''}${m.promoted?' = queen':''}${m.breachReady?' · gateway ready':''}${m.climb?' · CLIMBED':''}`}
  removeArmy(id){for(const[k,p]of Object.entries(this.board))if(p.armyId===id)delete this.board[k]}
  activeTeams(){return new Set(this.armies.filter(a=>!this.eliminated.has(a.id)).map(a=>a.team))}
  advanceTurn(){let n=0;do{this.turnIndex=(this.turnIndex+1)%this.armies.length;n++}while(this.eliminated.has(this.currentArmy().id)&&n<=this.armies.length)}
  resolveTurnStart(){
    while(!this.gameOver){const army=this.currentArmy(),moves=this.allLegalMoves(army.id),check=this.inCheck(army.id);if(moves.length){this.lastEvent=check?`${army.commander}'s ${army.face}${army.side} king is in check.`:`${army.commander} · ${army.face}${army.side} to move.`;return{type:check?'check':'turn',message:this.lastEvent,moves:moves.length}}
      this.eliminated.add(army.id);this.removeArmy(army.id);const reason=check?'checkmated':'stalemated',teams=this.activeTeams();if(teams.size<=1){this.gameOver=true;this.winner=[...teams][0]||null;this.lastEvent=`${this.winner||'Nobody'} wins ${this.config.label}!`;return{type:'game-over',message:this.lastEvent}}this.lastEvent=`${army.commander}'s ${army.face}${army.side} army is ${reason} and eliminated.`;this.advanceTurn()}
  }
  play(move){if(this.gameOver)return null;const result=this.applyMove(move);this.advanceTurn();const state=this.resolveTurnStart();return{...result,state}}
}
