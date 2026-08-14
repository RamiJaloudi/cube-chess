const THREE=globalThis.THREE;
if(!THREE) throw new Error('Three.js must load before magnetic-models.mjs');

// Record the glyph drawn into each generated piece texture so the procedural
// renderer can select a distinct sculpted model without changing app.mjs.
if(globalThis.CanvasRenderingContext2D){
  const originalFillText=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){
    if(this.canvas&&typeof text==='string') this.canvas.dataset.pieceGlyph=text;
    return originalFillText.call(this,text,...args);
  };
}

const OriginalSprite=THREE.Sprite;
const TYPE_BY_GLYPH={'♟':'pawn','♞':'knight','♝':'bishop','♜':'rook','♛':'queen','♚':'king'};

function accentFromTexture(texture){
  try{const ctx=texture?.image?.getContext?.('2d');if(!ctx)return 0x8b7cff;const p=ctx.getImageData(80,17,1,1).data;return(p[0]<<16)|(p[1]<<8)|p[2];}catch{return 0x8b7cff;}
}
function mesh(geometry,material,parent,x=0,y=0,z=0){const value=new THREE.Mesh(geometry,material);value.position.set(x,y,z);parent.add(value);return value;}
function cylinder(parent,material,top,bottom,height,y,segments=32){return mesh(new THREE.CylinderGeometry(top,bottom,height,segments),material,parent,0,y,0)}
function sphere(parent,material,radius,y,stretchY=1){const value=mesh(new THREE.SphereGeometry(radius,24,16),material,parent,0,y,0);value.scale.y=stretchY;return value}
function torus(parent,material,radius,tube,y){const value=mesh(new THREE.TorusGeometry(radius,tube,10,32),material,parent,0,y,0);value.rotation.x=-Math.PI/2;return value}

function addPawn(body,metal){
  cylinder(body,metal,.038,.055,.07,.072);torus(body,metal,.041,.009,.111);sphere(body,metal,.033,.143);return .177;
}
function addRook(body,metal,dark){
  cylinder(body,metal,.047,.059,.085,.08);cylinder(body,dark,.06,.048,.026,.136);
  for(let i=0;i<4;i++){const angle=i*Math.PI/2,block=mesh(new THREE.BoxGeometry(.027,.027,.035),metal,body,Math.cos(angle)*.041,.16,Math.sin(angle)*.041);block.rotation.y=-angle;}
  return .18;
}
function addBishop(body,metal){
  cylinder(body,metal,.025,.058,.105,.091);torus(body,metal,.034,.008,.139);sphere(body,metal,.03,.165,1.18);
  const cut=mesh(new THREE.BoxGeometry(.009,.04,.05),new THREE.MeshBasicMaterial({color:0x090b11}),body,.007,.169,.015);cut.rotation.z=-.5;return .201;
}
function addKnight(body,metal,dark){
  cylinder(body,metal,.045,.059,.055,.064);const chest=mesh(new THREE.ConeGeometry(.05,.1,20),metal,body,.008,.126,0);chest.rotation.z=-.2;
  const head=mesh(new THREE.SphereGeometry(.035,20,14),metal,body,-.018,.177,0);head.scale.set(1.2,1,.72);
  const muzzle=mesh(new THREE.ConeGeometry(.025,.065,16),metal,body,-.042,.178,.005);muzzle.rotation.z=-Math.PI/2.5;
  const ear1=mesh(new THREE.ConeGeometry(.011,.04,10),dark,body,-.005,.216,.015);ear1.rotation.z=-.15;
  return .235;
}
function addQueen(body,metal,dark){
  cylinder(body,metal,.029,.06,.115,.096);torus(body,metal,.045,.009,.15);sphere(body,metal,.025,.173);
  for(let i=0;i<6;i++){const angle=i*Math.PI/3,tip=mesh(new THREE.ConeGeometry(.009,.047,10),metal,body,Math.cos(angle)*.03,.206,Math.sin(angle)*.03);tip.rotation.z=-Math.cos(angle)*.3;tip.rotation.x=Math.sin(angle)*.3;}
  sphere(body,dark,.014,.225);return .243;
}
function addKing(body,metal,dark){
  cylinder(body,metal,.03,.06,.12,.098);torus(body,metal,.043,.009,.155);sphere(body,metal,.023,.179);
  mesh(new THREE.BoxGeometry(.016,.065,.016),dark,body,0,.225,0);mesh(new THREE.BoxGeometry(.052,.015,.016),dark,body,0,.235,0);return .263;
}

function sculptedPiece(spriteMaterial,type){
  const outer=new THREE.Group();
  // app.mjs scales old sprites after construction. Preserve model dimensions.
  const setScale=outer.scale.set.bind(outer.scale);outer.scale.set=()=>setScale(1,1,1);
  const accent=accentFromTexture(spriteMaterial.map);
  const metal=new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:.12,metalness:.72,roughness:.24});
  const dark=new THREE.MeshStandardMaterial({color:0x161925,metalness:.88,roughness:.2});

  const glow=mesh(new THREE.CircleGeometry(.128,36),new THREE.MeshBasicMaterial({color:accent,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false}),outer,0,0,.032);
  glow.renderOrder=1;

  const body=new THREE.Group();body.rotation.x=-Math.PI/2;body.position.z=.032;outer.add(body);
  cylinder(body,dark,.082,.092,.024,.012);cylinder(body,metal,.071,.083,.022,.034);torus(body,metal,.068,.008,.046);
  const heights={pawn:addPawn,rook:addRook,bishop:addBishop,knight:addKnight,queen:addQueen,king:addKing};
  const top=(heights[type]||addPawn)(body,metal,dark);

  // A small face-aligned crest preserves instant piece recognition when viewed
  // almost directly down the model's standing axis from the cube center.
  const crest=new THREE.Mesh(new THREE.CircleGeometry(.034,28),new THREE.MeshBasicMaterial({map:spriteMaterial.map,transparent:true,side:THREE.DoubleSide,depthTest:true}));
  crest.rotation.x=-Math.PI/2;crest.position.y=top+.004;crest.renderOrder=4;body.add(crest);
  outer.userData.magneticPiece=true;outer.userData.pieceType=type;
  return outer;
}

class SculptedSprite extends OriginalSprite{
  constructor(material){
    super(material);
    const image=material?.map?.image,glyph=image?.dataset?.pieceGlyph,type=TYPE_BY_GLYPH[glyph];
    if(image?.width===160&&image?.height===160) return sculptedPiece(material,type||'pawn');
  }
}

THREE.Sprite=SculptedSprite;
