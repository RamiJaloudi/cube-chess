const style=document.createElement('style');
style.textContent=`
  .cube-logo-intro{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at 50% 42%,#252c54 0,#090c18 43%,#040509 100%);opacity:1;transition:opacity .72s ease,visibility .72s ease}
  .cube-logo-intro.is-leaving{opacity:0;visibility:hidden;pointer-events:none}
  .cube-logo-stage{display:grid;place-items:center;gap:3rem;perspective:900px;transform:translateY(-.5rem)}
  .cube-logo-object{position:relative;width:140px;height:140px;transform-style:preserve-3d;animation:cube-logo-camera 3.7s cubic-bezier(.18,.72,.25,1) both}
  .cube-logo-face{position:absolute;inset:0;border:2px solid #73e7ffb8;background-color:#15203ba6;background-image:linear-gradient(#ffffff29 1px,transparent 1px),linear-gradient(90deg,#ffffff29 1px,transparent 1px);background-size:17.5px 17.5px;box-shadow:inset 0 0 28px #6e67ff2c,0 0 22px #42dfff22;backface-visibility:visible;transform-style:preserve-3d}
  .cube-logo-face.front{animation:fold-front 3.7s ease-in-out both}.cube-logo-face.back{animation:fold-back 3.7s ease-in-out both}.cube-logo-face.right{animation:fold-right 3.7s ease-in-out both}.cube-logo-face.left{animation:fold-left 3.7s ease-in-out both}.cube-logo-face.top{animation:fold-top 3.7s ease-in-out both}.cube-logo-face.bottom{animation:fold-bottom 3.7s ease-in-out both}
  .flat-piece{position:absolute;width:12px;height:21px;border-radius:50% 50% 28% 28%;background:linear-gradient(135deg,#fff,#a9b5df 58%,#45558b);box-shadow:0 0 12px #ffffff8c;translate:-50% -50%;animation:flatten-pieces 3.7s ease both}
  .flat-piece:after,.inner-piece:after{content:"";position:absolute;left:50%;bottom:-4px;translate:-50% 0;width:17px;height:5px;border-radius:50%;background:inherit}
  .flat-piece.f1{left:25%;top:74%}.flat-piece.f2{left:45%;top:74%}.flat-piece.f3{left:65%;top:74%}.flat-piece.f4{left:75%;top:25%;background:linear-gradient(135deg,#ffda86,#ff6463 62%,#771c43)}.flat-piece.f5{left:55%;top:25%;background:linear-gradient(135deg,#ffda86,#ff6463 62%,#771c43)}
  .cube-logo-army{position:absolute;inset:0;transform-style:preserve-3d;pointer-events:none}
  .inner-piece{position:absolute;left:50%;top:50%;width:12px;height:25px;border-radius:50% 50% 28% 28%;background:linear-gradient(135deg,#fff,#9dafe5 58%,#3c4d87);box-shadow:0 0 14px #cde7ff;opacity:0;animation:reveal-inner 3.7s ease both}
  .inner-piece.red{background:linear-gradient(135deg,#ffd67b,#ff5e65 62%,#74193f);box-shadow:0 0 14px #ff768c}.inner-piece.blue{background:linear-gradient(135deg,#aaffea,#44aaff 62%,#243c9c);box-shadow:0 0 14px #65cbff}
  .inner-piece.p1{transform:translate3d(-46px,39px,-47px)}.inner-piece.p2{transform:translate3d(-17px,39px,-47px)}.inner-piece.p3{transform:translate3d(14px,39px,-47px)}.inner-piece.p4{transform:translate3d(40px,-48px,26px)}.inner-piece.p5{transform:translate3d(9px,-48px,26px)}.inner-piece.p6{transform:translate3d(-35px,2px,51px)}
  .cube-logo-copy{text-align:center;text-transform:uppercase;text-shadow:0 4px 28px #000;opacity:0;animation:reveal-copy 3.7s ease both}.cube-logo-copy strong{display:block;font-size:clamp(1.65rem,4vw,2.7rem);letter-spacing:.3em;margin-right:-.3em;color:#f6f7ff}.cube-logo-copy span{display:block;margin-top:.55rem;font-size:.68rem;letter-spacing:.34em;margin-right:-.34em;color:#85dcff}
  @keyframes cube-logo-camera{0%,31%{transform:rotateX(0) rotateY(0) scale(.47)}52%{transform:rotateX(-8deg) rotateY(35deg) scale(.74)}78%{transform:rotateX(-23deg) rotateY(250deg) scale(1.04)}100%{transform:rotateX(-14deg) rotateY(322deg) scale(1)}}
  @keyframes fold-front{0%,31%{transform:translateZ(0)}58%,100%{transform:translateZ(70px)}}
  @keyframes fold-back{0%,31%{transform:translateX(280px)}58%,100%{transform:rotateY(180deg) translateZ(70px)}}
  @keyframes fold-right{0%,31%{transform:translateX(140px)}58%,100%{transform:rotateY(90deg) translateZ(70px)}}
  @keyframes fold-left{0%,31%{transform:translateX(-140px)}58%,100%{transform:rotateY(-90deg) translateZ(70px)}}
  @keyframes fold-top{0%,31%{transform:translateY(-140px)}58%,100%{transform:rotateX(90deg) translateZ(70px)}}
  @keyframes fold-bottom{0%,31%{transform:translateY(140px)}58%,100%{transform:rotateX(-90deg) translateZ(70px)}}
  @keyframes flatten-pieces{0%,34%{opacity:1}52%,100%{opacity:0}}
  @keyframes reveal-inner{0%,54%{opacity:0}68%,100%{opacity:1}}
  @keyframes reveal-copy{0%,65%{opacity:0;transform:translateY(8px)}82%,100%{opacity:1;transform:translateY(0)}}
  @media(max-width:560px){.cube-logo-object{width:120px;height:120px}.cube-logo-stage{gap:2.5rem}}
  @media(prefers-reduced-motion:reduce){.cube-logo-object{animation:none;transform:rotateX(-14deg) rotateY(322deg)}.cube-logo-face.front{animation:none;transform:translateZ(70px)}.cube-logo-face.back{animation:none;transform:rotateY(180deg) translateZ(70px)}.cube-logo-face.right{animation:none;transform:rotateY(90deg) translateZ(70px)}.cube-logo-face.left{animation:none;transform:rotateY(-90deg) translateZ(70px)}.cube-logo-face.top{animation:none;transform:rotateX(90deg) translateZ(70px)}.cube-logo-face.bottom{animation:none;transform:rotateX(-90deg) translateZ(70px)}.flat-piece{display:none}.inner-piece,.cube-logo-copy{animation:none;opacity:1}.cube-logo-intro{transition-duration:.2s}}
`;
document.head.append(style);

const intro=document.createElement('div');
intro.className='cube-logo-intro';
intro.setAttribute('aria-label','Cube Chess');
intro.innerHTML=`
  <div class="cube-logo-stage">
    <div class="cube-logo-object" aria-hidden="true">
      <div class="cube-logo-face front"><i class="flat-piece f1"></i><i class="flat-piece f2"></i><i class="flat-piece f3"></i><i class="flat-piece f4"></i><i class="flat-piece f5"></i></div>
      <div class="cube-logo-face back"></div><div class="cube-logo-face right"></div><div class="cube-logo-face left"></div><div class="cube-logo-face top"></div><div class="cube-logo-face bottom"></div>
      <div class="cube-logo-army"><i class="inner-piece p1"></i><i class="inner-piece p2"></i><i class="inner-piece p3"></i><i class="inner-piece red p4"></i><i class="inner-piece red p5"></i><i class="inner-piece blue p6"></i></div>
    </div>
    <div class="cube-logo-copy"><strong>Cube Chess</strong><span>Every surface is a threat</span></div>
  </div>
`;
document.body.append(intro);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const dismiss=()=>{if(intro.classList.contains('is-leaving'))return;intro.classList.add('is-leaving');setTimeout(()=>{intro.remove();style.remove()},800)};
intro.addEventListener('click',dismiss);
setTimeout(dismiss,reduced?850:4350);
