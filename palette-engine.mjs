const PATCHED=Symbol.for('cube-chess.palette-rules');

export function installPaletteRules(GameClass,theme,onGame=()=>{}){
  const proto=GameClass.prototype;
  if(proto[PATCHED])return;
  proto[PATCHED]=true;
  const originalReset=proto.reset;
  proto.reset=function(...args){
    const result=originalReset.apply(this,args);
    this.config.palette=theme.id;
    if(this.config.kind==='teams'){
      const teamColors=new Map();
      for(const army of this.armies){
        if(!teamColors.has(army.team))teamColors.set(army.team,theme.armies[teamColors.size%theme.armies.length]);
        army.color=teamColors.get(army.team);
      }
    }else{
      this.armies.forEach((army,index)=>army.color=theme.armies[index%theme.armies.length]);
    }
    onGame(this);
    return result;
  };
}
