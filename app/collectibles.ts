export type CollectibleDef={id:string;name:string;label:string;offSrc:string;onSrc:string;category:"hardware"|"sci-fi"|"apparel"|"misc";href?:string};
const BASE="https://dotcom.workos.com/images/launch-week/summer-2026/shelf-items/";
export const COLLECTIBLES:CollectibleDef[]=[
 {id:"science-kit",name:"science-kit",label:"Science Kit",offSrc:BASE+"science-kit-off.avif",onSrc:BASE+"science-kit-on.avif",category:"hardware"},
 {id:"imac",name:"imac",label:"iMac Classic",offSrc:BASE+"imac-off.avif",onSrc:BASE+"imac-on.avif",category:"hardware",href:"https://workos.com/404"},
 {id:"3d-printer",name:"3d-printer",label:"3D Printer",offSrc:BASE+"3d-printer-off.avif",onSrc:BASE+"3d-printer-on.avif",category:"hardware"},
 {id:"cd-player",name:"cd-player",label:"CD Player",offSrc:BASE+"cd-player-off.avif",onSrc:BASE+"cd-player-on.avif",category:"hardware",href:"https://workos.com/launch-week/spring-2026"},
 {id:"boombox",name:"boombox",label:"Boombox",offSrc:BASE+"boombox-off.avif",onSrc:BASE+"boombox-on.avif",category:"hardware"},
 {id:"headphones",name:"headphones",label:"Headphones",offSrc:BASE+"headphones-off.avif",onSrc:BASE+"headphones-on.avif",category:"hardware",href:"https://shop.workos.com/product/workos-ecosystem-sticker-pack"},
 {id:"ship",name:"ship",label:"Model Ship",offSrc:BASE+"ship-off.avif",onSrc:BASE+"ship-on.avif",category:"misc"},
 {id:"diary",name:"diary",label:"Diary",offSrc:BASE+"diary-off.avif",onSrc:BASE+"diary-on.avif",category:"misc"},
 {id:"polaroid",name:"polaroid",label:"Polaroid",offSrc:BASE+"polaroid-off.avif",onSrc:BASE+"polaroid-on.avif",category:"misc"},
 {id:"holland-park",name:"holland-park",label:"Holland Park",offSrc:BASE+"holland-park-off.avif",onSrc:BASE+"holland-park-on.avif",category:"misc"},
 {id:"rockets",name:"rockets",label:"Rockets",offSrc:BASE+"rockets-off.avif",onSrc:BASE+"rockets-on.avif",category:"sci-fi"},
 {id:"helmet",name:"helmet",label:"Retro Helmet",offSrc:BASE+"helmet-off.avif",onSrc:BASE+"helmet-on.avif",category:"sci-fi",href:"https://shop.workos.com/product/workos-ecosystem-sticker-pack"},
 {id:"spaceship",name:"spaceship",label:"Spaceship",offSrc:BASE+"spaceship-off.avif",onSrc:BASE+"spaceship-on.avif",category:"sci-fi"},
 {id:"delorean",name:"delorean",label:"DeLorean",offSrc:BASE+"delorean-off.avif",onSrc:BASE+"delorean-on.avif",category:"sci-fi"},
 {id:"mcp-shirt",name:"mcp-shirt",label:"MCP Shirt",offSrc:BASE+"mcp-shirt-off.avif",onSrc:BASE+"mcp-shirt-on.avif",category:"apparel",href:"https://shop.workos.com/product/run-mcp-t-shirt"},
 {id:"skateboard",name:"skateboard",label:"T3 Skateboard",offSrc:BASE+"skateboard-off.avif",onSrc:BASE+"skateboard-on.avif",category:"apparel",href:"https://shop.workos.com/product/t3-skateboard"},
 {id:"clothes",name:"clothes",label:"Acronym Shirt",offSrc:BASE+"clothes-off.avif",onSrc:BASE+"clothes-on.avif",category:"apparel",href:"https://shop.workos.com/product/acronym-shirt"},
 {id:"media-station",name:"media-station",label:"Retro Media Center",offSrc:"/retro-media/media-center-isolated.png",onSrc:"/retro-media/media-center-isolated.png",category:"hardware"},
 {id:"retro-tv-pon",name:"retro-tv-pon",label:"PON! CRT Television",offSrc:"/retro-media/tv-isolated.png",onSrc:"/retro-media/tv-isolated.png",category:"hardware"},
 {id:"oxo-dvd-deck",name:"oxo-dvd-deck",label:"OXO DVD/VCR Deck",offSrc:"/retro-media/dvd-isolated.png",onSrc:"/retro-media/dvd-isolated.png",category:"hardware"},
 {id:"studio-monitors",name:"studio-monitors",label:"Studio Monitor Speaker",offSrc:"/retro-media/speaker-left-isolated.png",onSrc:"/retro-media/speaker-left-isolated.png",category:"hardware"},
 {id:"crt-vintage-1",name:"crt-vintage-1",label:"Vintage Wood-Trim CRT",offSrc:"/crt-tvs-and-imac/crt1-removebg-preview.png",onSrc:"/crt-tvs-and-imac/crt1-removebg-preview.png",category:"hardware"},
 {id:"crt-dual-knob",name:"crt-dual-knob",label:"Dual-Knob CRT TV",offSrc:"/crt-tvs-and-imac/crt2-removebg-preview.png",onSrc:"/crt-tvs-and-imac/crt2-removebg-preview.png",category:"hardware"},
 {id:"crt-studio-monitor",name:"crt-studio-monitor",label:"Studio Pushbutton CRT",offSrc:"/crt-tvs-and-imac/crt3-removebg-preview.png",onSrc:"/crt-tvs-and-imac/crt3-removebg-preview.png",category:"hardware"},
 {id:"crt-vhf-uhf",name:"crt-vhf-uhf",label:"Classic VHF/UHF CRT TV",offSrc:"/crt-tvs-and-imac/crt4-removebg-preview.png",onSrc:"/crt-tvs-and-imac/crt4-removebg-preview.png",category:"hardware"},
 {id:"imac-g3-bondi",name:"imac-g3-bondi",label:"Bondi Blue iMac G3",offSrc:"/crt-tvs-and-imac/imac1-removebg-preview.png",onSrc:"/crt-tvs-and-imac/imac1-removebg-preview.png",category:"hardware"},
 {id:"imac-g3-astronaut",name:"imac-g3-astronaut",label:"iMac G3 & Astronaut",offSrc:"/crt-tvs-and-imac/imac2-removebg-preview.png",onSrc:"/crt-tvs-and-imac/imac2-removebg-preview.png",category:"hardware"},
 {id:"imac-g3-angled",name:"imac-g3-angled",label:"iMac G3 Profile",offSrc:"/crt-tvs-and-imac/imac3-removebg-preview.png",onSrc:"/crt-tvs-and-imac/imac3-removebg-preview.png",category:"hardware"},
];
export const COLLECTIBLE_CATEGORIES=["all","hardware","sci-fi","apparel","misc"] as const;
export type CollectibleCategory=typeof COLLECTIBLE_CATEGORIES[number];
