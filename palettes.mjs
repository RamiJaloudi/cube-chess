export const PALETTES={
  default:{name:'Cube Neon',colors:['#ff5b5f','#64a0ff','#ffd44d','#f4f1e8','#b66cff'],accent:'#8b7cff',background:'#07080d',boardLight:'#c2c3bd',boardDark:'#292d35',armies:['#ff5b5f','#64a0ff','#ffd44d','#f4f1e8','#b66cff','#49d8a5','#ff8a45','#55d6ff','#e66baf','#9bd84b','#a7a0ff','#d8a46b']},
  beach:{name:'Beach',colors:['#96ceb4','#ffeead','#ff6f69','#ffcc5c','#88d8b0'],accent:'#ff6f69'},
  pastel:{name:'Pastel Rainbow',colors:['#a8e6cf','#dcedc1','#ffd3b6','#ffaaa5','#ff8b94'],accent:'#ff8b94'},
  cappuccino:{name:'Cappuccino',colors:['#4b3832','#854442','#fff4e6','#3c2f2f','#be9b7b'],accent:'#be9b7b'},
  skin:{name:'Skin Tones',colors:['#8d5524','#c68642','#e0ac69','#f1c27d','#ffdbac'],accent:'#e0ac69'},
  retro:{name:'Retro',colors:['#666547','#fb2e01','#6fcb9f','#ffe28a','#fffeb3'],accent:'#fb2e01'},
  vaporwave:{name:'VaporWave',colors:['#ff71ce','#01cdfe','#05ffa1','#b967ff','#fffb96'],accent:'#b967ff'},
  crimson:{name:'Crimson Citadel',colors:['#740001','#ae0001','#eeba30','#d3a625','#000000'],accent:'#eeba30'},
  underwater:{name:'Underwater Scene',colors:['#daf8e3','#97ebdb','#00c2c7','#0086ad','#005582'],accent:'#00c2c7'},
  signal:{name:'Primary Signal',colors:['#008744','#0057e7','#d62d20','#ffa700','#ffffff'],accent:'#0057e7'},
  prismatic:{name:'Prismatic Velocity',colors:['#ee4035','#f37736','#fdf498','#7bc043','#0392cf'],accent:'#0392cf'},
  mint:{name:'Mint System',colors:['#009688','#35a79c','#54b2a9','#65c3ba','#83d0c9'],accent:'#009688'}
};

export function hexToRgb(hex){
  const value=parseInt(hex.slice(1),16);
  return{r:value>>16,g:(value>>8)&255,b:value&255};
}

export function mixHex(a,b,amount){
  const x=hexToRgb(a),y=hexToRgb(b),mix=channel=>Math.round(channel[0]+(channel[1]-channel[0])*amount);
  return`#${[mix([x.r,y.r]),mix([x.g,y.g]),mix([x.b,y.b])].map(value=>value.toString(16).padStart(2,'0')).join('')}`;
}

export function luminance(hex){
  const {r,g,b}=hexToRgb(hex);
  return(.2126*r+.7152*g+.0722*b)/255;
}

export function expandArmyColors(colors){
  const ordered=[...colors].sort((a,b)=>luminance(b)-luminance(a));
  const seeds=[ordered[0],ordered.at(-1),...colors.filter(color=>color!==ordered[0]&&color!==ordered.at(-1))];
  const expanded=[...seeds];
  for(const color of seeds)expanded.push(mixHex(color,luminance(color)>.55?'#000000':'#ffffff',.24));
  for(const color of seeds)expanded.push(mixHex(color,luminance(color)>.55?'#000000':'#ffffff',.42));
  return expanded.slice(0,12);
}

export function themeFor(id='default'){
  const palette=PALETTES[id]||PALETTES.default;
  const ordered=[...palette.colors].sort((a,b)=>luminance(a)-luminance(b));
  const darkest=ordered[0],lightest=ordered.at(-1);
  return{
    id:PALETTES[id]?id:'default',
    ...palette,
    background:palette.background||mixHex(darkest,'#05070c',.68),
    panel:mixHex(darkest,'#0b0d15',.46),
    boardLight:palette.boardLight||mixHex(lightest,'#ffffff',.1),
    boardDark:palette.boardDark||mixHex(darkest,'#171a23',.32),
    armies:palette.armies||expandArmyColors(palette.colors)
  };
}

export const hexNumber=hex=>parseInt(hex.slice(1),16);
