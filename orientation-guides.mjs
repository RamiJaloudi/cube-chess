if(new URLSearchParams(location.search).get('mode')==='classic'&&globalThis.THREE){
  const OriginalScene=THREE.Scene;
  let capturedScene=null;
  THREE.Scene=class OrientationScene extends OriginalScene{
    constructor(...args){super(...args);capturedScene=this}
  };

  function labelTexture(text){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
    const context=canvas.getContext('2d');
    context.clearRect(0,0,canvas.width,canvas.height);
    context.strokeStyle='rgba(235,242,255,.2)';context.lineWidth=2;
    context.beginPath();context.moveTo(42,102);context.lineTo(726,102);context.stroke();
    context.font='500 35px Segoe UI, system-ui, sans-serif';
    context.fillStyle='rgba(235,242,255,.58)';
    context.textAlign='center';context.textBaseline='middle';
    context.letterSpacing='7px';context.fillText(text,384,58);
    const texture=new THREE.CanvasTexture(canvas);texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
    return texture;
  }

  function guide(text,x){
    const material=new THREE.MeshBasicMaterial({map:labelTexture(text),transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.82,.14),material);
    mesh.position.set(x,-.82,-.028);mesh.rotation.y=Math.PI;
    mesh.renderOrder=5;mesh.userData.orientationGuide=true;
    return mesh;
  }

  function install(){
    if(!capturedScene)return false;
    let backWall=null;
    capturedScene.traverse(object=>{
      if(backWall||!object.isGroup)return;
      if(object.children.some(child=>child.userData?.face==='B'&&Number.isInteger(child.userData?.row)))backWall=object;
    });
    if(!backWall||backWall.children.some(child=>child.userData?.orientationGuide))return Boolean(backWall);
    backWall.add(guide('<  BLACK START',-.52));
    backWall.add(guide('WHITE START  >',.52));
    return true;
  }

  let attempts=0;
  const timer=setInterval(()=>{attempts++;if(install()||attempts>20)clearInterval(timer)},50);
}
