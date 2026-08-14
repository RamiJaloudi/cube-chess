function safeCell(value){
  let text=value==null?'':String(value);
  if(/^[=+\-@]/.test(text))text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

function coordinate(square){
  if(!square)return'';
  return `${square.face}${square.row+1}${String.fromCharCode(65+square.col)}`;
}

export function gameToCsv(game){
  const headers=['Move','Mode','Commander','Army','Team','Piece','From','To','Action','Captured','Promotion','Gateway Ready','Result'];
  const finalResult=game.winner?`${game.winner} wins`:'Draw';
  const rows=game.history.map((move,index)=>{
    const army=game.army(move.armyId);
    const actions=[];
    if(move.to?.castle)actions.push(move.to.castle==='king'?'castle kingside':'castle queenside');
    else actions.push(move.captured?'capture':'move');
    if(move.climb)actions.push('climb');
    if(move.promoted)actions.push('promotion');
    return[
      move.turn||index+1,
      game.config.label,
      army?.commander||move.armyId,
      move.armyId,
      army?.team||'',
      move.piece,
      coordinate(move.from),
      coordinate(move.to),
      actions.join(' + '),
      move.captured||'',
      move.promoted?'queen':'',
      move.breachReady?'yes':'no',
      index===game.history.length-1&&game.gameOver?finalResult:''
    ];
  });
  return '\uFEFF'+[headers,...rows].map(row=>row.map(safeCell).join(',')).join('\r\n');
}

export function csvFilename(game,date=new Date()){
  const mode=(game.config.label||'cube-chess').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return `${mode}-${date.toISOString().slice(0,10)}-${game.history.length}-moves.csv`;
}
