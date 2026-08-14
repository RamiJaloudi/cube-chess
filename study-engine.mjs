const PATCHED=Symbol.for('cube-chess.study-hooks');

export function installStudyHooks(GameClass,state,onUpdate=()=>{}){
  const proto=GameClass.prototype;
  if(proto[PATCHED])return;
  proto[PATCHED]=true;
  const originalReset=proto.reset;
  const originalPlay=proto.play;
  const originalResolve=proto.resolveTurnStart;

  const report=game=>{
    state.current=game;
    queueMicrotask(()=>onUpdate(game));
  };

  proto.reset=function(...args){
    state.paused=false;
    state.stepAllowance=false;
    const result=originalReset.apply(this,args);
    report(this);
    return result;
  };

  proto.resolveTurnStart=function(...args){
    const result=originalResolve.apply(this,args);
    report(this);
    return result;
  };

  proto.play=function(move){
    if(state.paused&&!state.stepAllowance){
      report(this);
      return{paused:true,state:{type:'paused',message:'Match paused. Resume or step once to continue.'}};
    }
    if(state.stepAllowance)state.stepAllowance=false;
    const result=originalPlay.call(this,move);
    report(this);
    return result;
  };
}
